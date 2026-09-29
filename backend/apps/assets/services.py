"""Asset health bookkeeping and the system-generated risk analysis.

The risk analysis is a transparent, rule-based model computed from inspection
history. It is always labelled as system-generated decision support; it never
replaces an engineer's judgement.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import timedelta

from django.db.models import Count, Q
from django.utils import timezone

from apps.core.choices import Severity
from apps.core.models import PlatformConfiguration

from .models import StructuralAsset

RISK_MODEL_VERSION = "rule-based-risk-v1.2"

DEFECT_RECOMMENDATIONS = {
    "CRACK": "Map crack widths and lengths with a crack gauge; evaluate epoxy injection or routing-and-sealing for cracks wider than 0.3 mm.",
    "SPALLING": "Remove delaminated concrete, assess cover depth and patch with polymer-modified repair mortar.",
    "EXPOSED_REBAR": "Measure section loss on exposed reinforcement; clean, prime and restore cover. Assess load capacity if loss exceeds 10%.",
    "CORROSION": "Carry out half-cell potential and chloride testing to establish the extent of active corrosion.",
    "RUST": "Blast-clean affected steel to Sa 2.5 and re-apply the protective coating system.",
    "EFFLORESCENCE": "Investigate water ingress paths; review drainage and waterproofing membranes.",
    "SURFACE_DAMAGE": "Record surface defects for trend monitoring; schedule cosmetic repair with the next maintenance cycle.",
    "DEFORMATION": "Commission a geometric survey and structural assessment of the deformed element.",
}

PRIORITIES = (
    (70, "P1", "Immediate intervention", 7),
    (50, "P2", "Urgent — schedule within 30 days", 30),
    (30, "P3", "Planned — next maintenance cycle", 90),
    (0, "P4", "Routine monitoring", None),
)


@dataclass
class Factor:
    label: str
    detail: str
    contribution: float

    @property
    def impact(self) -> str:
        if self.contribution >= 15:
            return "high"
        if self.contribution >= 6:
            return "medium"
        return "low"

    def as_dict(self) -> dict:
        return {"label": self.label, "detail": self.detail, "contribution": round(self.contribution, 1), "impact": self.impact}


def refresh_asset_health(asset: StructuralAsset) -> StructuralAsset:
    """Recompute denormalised health fields from inspections and open alerts."""
    from apps.alerts.models import AlertStatus, MaintenanceAlert
    from apps.inspections.models import InspectionLog, InspectionStatus

    config = PlatformConfiguration.load()
    latest = (
        InspectionLog.objects.filter(structural_asset=asset, status=InspectionStatus.COMPLETED)
        .exclude(overall_health_score__isnull=True)
        .order_by("-inspection_date")
        .first()
    )
    open_severities = MaintenanceAlert.objects.filter(
        structural_asset=asset, status__in=[AlertStatus.OPEN, AlertStatus.INVESTIGATING]
    ).values_list("severity", flat=True)

    if latest is not None:
        asset.current_health_score = round(latest.overall_health_score, 1)
        asset.last_inspection_at = latest.inspection_date
    asset.health_status = config.health_status_for(asset.current_health_score)
    asset.risk_level = config.risk_level_for(asset.current_health_score, Severity.max(open_severities))
    asset.save(update_fields=["current_health_score", "last_inspection_at", "health_status", "risk_level", "updated_at"])
    return asset


def _monthly_slope(points: list[tuple[float, float]]) -> float:
    """Least-squares slope in score points per 30 days. ``points`` = (days, score)."""
    if len(points) < 2:
        return 0.0
    n = len(points)
    mean_x = sum(p[0] for p in points) / n
    mean_y = sum(p[1] for p in points) / n
    denom = sum((p[0] - mean_x) ** 2 for p in points)
    if denom == 0:
        return 0.0
    slope_per_day = sum((p[0] - mean_x) * (p[1] - mean_y) for p in points) / denom
    return slope_per_day * 30


def build_risk_analysis(asset: StructuralAsset) -> dict:
    from apps.alerts.models import AlertStatus, MaintenanceAlert
    from apps.inspections.models import DefectDetection, InspectionLog, InspectionStatus

    now = timezone.now()
    history = list(
        InspectionLog.objects.filter(structural_asset=asset, status=InspectionStatus.COMPLETED)
        .exclude(overall_health_score__isnull=True)
        .order_by("-inspection_date")
        .values("id", "inspection_date", "overall_health_score")[:12]
    )
    factors: list[Factor] = []

    if not history:
        return {
            "generated_by": "system",
            "method": RISK_MODEL_VERSION,
            "generated_at": now,
            "has_data": False,
            "risk_score": None,
            "priority": None,
            "summary": "No completed AI inspections yet. Run an inspection to generate a risk analysis.",
            "factors": [],
            "recommendations": ["Schedule a baseline inspection to establish the asset's structural condition."],
            "recommended_next_inspection": now.date(),
            "trend_per_month": None,
            "projected_score_90d": None,
            "disclaimer": _disclaimer(),
        }

    latest = history[0]
    score = float(latest["overall_health_score"])
    points = [((row["inspection_date"] - history[-1]["inspection_date"]).days, float(row["overall_health_score"])) for row in history]
    slope = _monthly_slope(points)
    projected = max(0.0, min(100.0, score + slope * 3))

    health_component = (100 - score) * 0.45
    factors.append(Factor("Current structural health", f"Latest AI health score is {score:.0f}/100.", health_component))

    trend_component = max(0.0, min(20.0, -slope * 6))
    if slope < -0.5:
        factors.append(Factor("Deteriorating trend", f"Health is declining by {abs(slope):.1f} points per month.", trend_component))
    elif slope > 0.5:
        factors.append(Factor("Improving trend", f"Health improved by {slope:.1f} points per month (e.g. after repairs).", 0.0))

    severity_counts = (
        DefectDetection.objects.filter(inspection_id=latest["id"])
        .exclude(review_status="REJECTED")
        .aggregate(
            critical=Count("id", filter=Q(severity=Severity.CRITICAL)),
            high=Count("id", filter=Q(severity=Severity.HIGH)),
            medium=Count("id", filter=Q(severity=Severity.MEDIUM)),
        )
    )
    severity_component = min(25.0, severity_counts["critical"] * 12 + severity_counts["high"] * 6 + severity_counts["medium"] * 1.5)
    if severity_component > 0:
        factors.append(
            Factor(
                "Severe defects in latest inspection",
                f"{severity_counts['critical']} critical, {severity_counts['high']} high and {severity_counts['medium']} medium findings.",
                severity_component,
            )
        )

    open_alerts = MaintenanceAlert.objects.filter(
        structural_asset=asset, status__in=[AlertStatus.OPEN, AlertStatus.INVESTIGATING]
    ).aggregate(
        total=Count("id"),
        critical=Count("id", filter=Q(severity=Severity.CRITICAL)),
        high=Count("id", filter=Q(severity=Severity.HIGH)),
    )
    alert_component = min(10.0, open_alerts["critical"] * 5 + open_alerts["high"] * 3 + max(0, open_alerts["total"] - open_alerts["critical"] - open_alerts["high"]))
    if open_alerts["total"]:
        factors.append(Factor("Unresolved maintenance alerts", f"{open_alerts['total']} alert(s) still open or under investigation.", alert_component))

    days_since = (now - latest["inspection_date"]).days
    overdue_days = days_since - asset.inspection_interval_days
    overdue_component = 0.0
    if overdue_days > 0:
        overdue_component = min(10.0, 4 + overdue_days / 30)
        factors.append(Factor("Inspection overdue", f"Last inspected {days_since} days ago (interval {asset.inspection_interval_days} days).", overdue_component))

    age_component = 0.0
    if asset.age_years is not None:
        age_component = min(6.0, asset.age_years / 12)
        if asset.age_years >= 30:
            factors.append(Factor("Structure age", f"In service for {asset.age_years:.0f} years.", age_component))

    risk_score = round(min(100.0, health_component + trend_component + severity_component + alert_component + overdue_component + age_component), 1)
    for threshold, code, label, horizon_days in PRIORITIES:
        if risk_score >= threshold:
            priority = {"code": code, "label": label}
            horizon = horizon_days if horizon_days is not None else asset.inspection_interval_days
            break

    dominant_types = list(
        DefectDetection.objects.filter(inspection__structural_asset=asset, inspection__status=InspectionStatus.COMPLETED)
        .exclude(review_status="REJECTED")
        .values("defect_type")
        .annotate(n=Count("id"))
        .order_by("-n")
        .values_list("defect_type", flat=True)[:3]
    )
    recommendations = [DEFECT_RECOMMENDATIONS[t] for t in dominant_types if t in DEFECT_RECOMMENDATIONS]
    if overdue_days > 0:
        recommendations.insert(0, "Bring the asset back within its inspection interval with a follow-up AI inspection.")
    if slope < -1.5:
        recommendations.append("Increase inspection frequency until the deterioration trend is understood.")
    if not recommendations:
        recommendations.append("Continue routine monitoring at the configured inspection interval.")

    factors.sort(key=lambda f: f.contribution, reverse=True)
    trend_word = "declining" if slope < -0.5 else "improving" if slope > 0.5 else "stable"
    summary = (
        f"Risk score {risk_score:.0f}/100 ({priority['code']}). Health {score:.0f}/100 and {trend_word}; "
        f"projected {projected:.0f}/100 in 90 days if no action is taken."
    )

    return {
        "generated_by": "system",
        "method": RISK_MODEL_VERSION,
        "generated_at": now,
        "has_data": True,
        "risk_score": risk_score,
        "priority": priority,
        "summary": summary,
        "factors": [f.as_dict() for f in factors],
        "recommendations": recommendations,
        "recommended_next_inspection": (now + timedelta(days=horizon)).date(),
        "trend_per_month": round(slope, 2),
        "projected_score_90d": round(projected, 1),
        "disclaimer": _disclaimer(),
    }


def _disclaimer() -> str:
    return (
        "System-generated analysis based on AI inspection results and a rule-based risk model. "
        "It is decision support only and must be reviewed by a qualified engineer before any maintenance decision."
    )
