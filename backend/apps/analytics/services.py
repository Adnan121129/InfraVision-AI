"""Aggregations behind the executive dashboard and the analytics page.

All heavy lifting happens in the database with ``GROUP BY`` queries; results
for the dashboard are cached briefly in Redis and invalidated whenever an
inspection completes.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta

from django.db.models import Avg, Count, Max, Q
from django.db.models.functions import TruncMonth
from django.utils import timezone

from apps.alerts.models import AlertStatus, MaintenanceAlert
from apps.assets.models import StructuralAsset
from apps.core.choices import HealthStatus, RiskLevel, Severity
from apps.inspections.models import DefectDetection, DefectType, InspectionLog, InspectionStatus, ReviewStatus
from apps.ml.models import MLModel, ModelStatus


def _month_key(value) -> str:
    if isinstance(value, datetime):
        value = value.date()
    return value.strftime("%Y-%m") if value else ""


def _month_series(start: date, end: date) -> list[str]:
    months = []
    cursor = date(start.year, start.month, 1)
    while cursor <= end:
        months.append(cursor.strftime("%Y-%m"))
        cursor = date(cursor.year + (cursor.month // 12), cursor.month % 12 + 1, 1)
    return months


def _pct_change(current: float, previous: float) -> float | None:
    if not previous:
        return None
    return round((current - previous) / previous * 100, 1)


def health_trend(inspections, months: list[str]) -> list[dict]:
    """Monthly fleet health index.

    For each month the index is the mean of every asset's most recent score
    known at the end of that month (carried forward between inspections), so
    the curve reflects the condition of the whole portfolio rather than which
    assets happened to be inspected that month.
    """
    rows = list(
        inspections.filter(status=InspectionStatus.COMPLETED, overall_health_score__isnull=False)
        .order_by("inspection_date")
        .values_list("structural_asset_id", "inspection_date", "overall_health_score", "health_status")
    )
    latest: dict[int, float] = {}
    series = []
    cursor = 0
    for month in months:
        year, mon = (int(part) for part in month.split("-"))
        month_end = date(year + (mon // 12), mon % 12 + 1, 1)
        count = critical = 0
        while cursor < len(rows) and rows[cursor][1].date() < month_end:
            asset_id, when, score, status = rows[cursor]
            latest[asset_id] = score
            if _month_key(when) == month:
                count += 1
                critical += status == HealthStatus.CRITICAL
            cursor += 1
        series.append(
            {
                "month": month,
                "avg_health": round(sum(latest.values()) / len(latest), 1) if latest else None,
                "assets_scored": len(latest),
                "inspections": count,
                "critical_inspections": critical,
            }
        )
    return series


def build_dashboard() -> dict:
    now = timezone.now()
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    prev_month_start = (month_start - timedelta(days=1)).replace(day=1)

    assets = StructuralAsset.objects.filter(is_archived=False)
    asset_counts = assets.aggregate(
        total=Count("id"),
        healthy=Count("id", filter=Q(health_status=HealthStatus.HEALTHY)),
        warning=Count("id", filter=Q(health_status=HealthStatus.WARNING)),
        critical=Count("id", filter=Q(health_status=HealthStatus.CRITICAL)),
        uninspected=Count("id", filter=Q(health_status__isnull=True)),
        avg_health=Avg("current_health_score"),
        new_this_month=Count("id", filter=Q(created_at__gte=month_start)),
    )

    inspections = InspectionLog.objects.all()
    this_month = inspections.filter(inspection_date__gte=month_start).count()
    last_month = inspections.filter(inspection_date__gte=prev_month_start, inspection_date__lt=month_start).count()

    active_alerts = MaintenanceAlert.objects.filter(status__in=[AlertStatus.OPEN, AlertStatus.INVESTIGATING])
    alerts_now = active_alerts.count()
    alerts_new_7d = MaintenanceAlert.objects.filter(created_at__gte=now - timedelta(days=7)).count()
    alerts_prev_7d = MaintenanceAlert.objects.filter(
        created_at__gte=now - timedelta(days=14), created_at__lt=now - timedelta(days=7)
    ).count()

    # Health trend of the fleet over the last 12 months
    start = (month_start - timedelta(days=330)).replace(day=1)
    months = _month_series(start.date(), now.date())
    trend = health_trend(inspections, months)

    # Health change month-over-month from the trend series
    scored = [row["avg_health"] for row in trend if row["avg_health"] is not None]
    health_delta = round(scored[-1] - scored[-2], 1) if len(scored) >= 2 else None

    recent = (
        inspections.select_related("structural_asset")
        .order_by("-created_at")
        .values(
            "id",
            "reference",
            "structural_asset_id",
            "structural_asset__asset_name",
            "structural_asset__asset_type",
            "inspection_date",
            "overall_health_score",
            "health_status",
            "defect_count",
            "max_severity",
            "status",
            "processing_stage",
            "inference_mode",
        )[:8]
    )

    critical_alerts = (
        active_alerts.filter(severity__in=[Severity.CRITICAL, Severity.HIGH])
        .select_related("structural_asset", "inspection")
        .order_by("-created_at")
        .values(
            "id",
            "reference",
            "title",
            "severity",
            "status",
            "created_at",
            "defect_type",
            "structural_asset_id",
            "structural_asset__asset_name",
            "inspection__reference",
        )[:6]
    )

    since = now - timedelta(days=7)
    queue = inspections.aggregate(
        uploading=Count("id", filter=Q(status=InspectionStatus.PENDING, created_at__gte=since)),
        queued=Count("id", filter=Q(status=InspectionStatus.QUEUED)),
        processing=Count("id", filter=Q(status=InspectionStatus.PROCESSING)),
        completed=Count("id", filter=Q(status=InspectionStatus.COMPLETED, completed_at__gte=since)),
        failed=Count("id", filter=Q(status=InspectionStatus.FAILED, updated_at__gte=since)),
    )

    risk = assets.values("risk_level").annotate(count=Count("id"))
    risk_distribution = {level: 0 for level in RiskLevel.values}
    for row in risk:
        risk_distribution[row["risk_level"]] = row["count"]

    active_model = (
        MLModel.objects.filter(status=ModelStatus.ACTIVE)
        .annotate(
            processed=Count("inspections", filter=Q(inspections__status=InspectionStatus.COMPLETED), distinct=True),
            avg_time=Avg("inspections__processing_time", filter=Q(inspections__status=InspectionStatus.COMPLETED)),
            last_used=Max("inspections__completed_at"),
        )
        .order_by("-last_heartbeat_at")
        .first()
    )
    model_status = None
    if active_model is not None:
        model_status = {
            "id": active_model.pk,
            "model_name": active_model.model_name,
            "version": active_model.version,
            "framework": active_model.get_framework_display(),
            "architecture": active_model.architecture,
            "accuracy": active_model.accuracy,
            "is_demo": active_model.is_demo,
            "status": active_model.status,
            "inspections_processed": active_model.processed,
            "avg_inference_time": round(active_model.avg_time, 2) if active_model.avg_time else None,
            "last_used_at": active_model.last_used,
            "last_heartbeat_at": active_model.last_heartbeat_at,
        }

    demo_share = inspections.filter(status=InspectionStatus.COMPLETED).aggregate(
        total=Count("id"), demo=Count("id", filter=Q(inference_mode="demo"))
    )

    return {
        "generated_at": now,
        "kpis": {
            "total_assets": asset_counts["total"],
            "new_assets_this_month": asset_counts["new_this_month"],
            "healthy_assets": asset_counts["healthy"],
            "at_risk_assets": asset_counts["warning"],
            "critical_assets": asset_counts["critical"],
            "uninspected_assets": asset_counts["uninspected"],
            "average_health": round(asset_counts["avg_health"], 1) if asset_counts["avg_health"] is not None else None,
            "average_health_delta": health_delta,
            "inspections_this_month": this_month,
            "inspections_last_month": last_month,
            "inspections_change_pct": _pct_change(this_month, last_month),
            "active_alerts": alerts_now,
            "alerts_new_7d": alerts_new_7d,
            "alerts_change_pct": _pct_change(alerts_new_7d, alerts_prev_7d),
        },
        "health_distribution": [
            {"status": HealthStatus.HEALTHY, "label": "Healthy", "count": asset_counts["healthy"]},
            {"status": HealthStatus.WARNING, "label": "Warning", "count": asset_counts["warning"]},
            {"status": HealthStatus.CRITICAL, "label": "Critical", "count": asset_counts["critical"]},
        ],
        "risk_distribution": risk_distribution,
        "health_trend": trend,
        "recent_inspections": [
            {
                "id": r["id"],
                "reference": r["reference"],
                "asset_id": r["structural_asset_id"],
                "asset_name": r["structural_asset__asset_name"],
                "asset_type": r["structural_asset__asset_type"],
                "inspection_date": r["inspection_date"],
                "overall_health_score": r["overall_health_score"],
                "health_status": r["health_status"],
                "defect_count": r["defect_count"],
                "max_severity": r["max_severity"],
                "status": r["status"],
                "processing_stage": r["processing_stage"],
                "inference_mode": r["inference_mode"],
            }
            for r in recent
        ],
        "critical_alerts": [
            {
                "id": a["id"],
                "reference": a["reference"],
                "title": a["title"],
                "severity": a["severity"],
                "status": a["status"],
                "created_at": a["created_at"],
                "defect_type": a["defect_type"],
                "asset_id": a["structural_asset_id"],
                "asset_name": a["structural_asset__asset_name"],
                "inspection_reference": a["inspection__reference"],
            }
            for a in critical_alerts
        ],
        "processing_queue": queue,
        "model_status": model_status,
        "demo_data": {"completed_inspections": demo_share["total"], "demo_inspections": demo_share["demo"]},
    }


def build_analytics(filters: dict) -> dict:
    """Analytics datasets, all honouring the same filter set."""
    now = timezone.now()
    date_to: date = filters.get("date_to") or now.date()
    date_from: date = filters.get("date_from") or (date_to - timedelta(days=365))
    months = _month_series(date_from, date_to)

    inspections = InspectionLog.objects.filter(inspection_date__date__gte=date_from, inspection_date__date__lte=date_to)
    detections = DefectDetection.objects.filter(
        inspection__inspection_date__date__gte=date_from,
        inspection__inspection_date__date__lte=date_to,
        inspection__status=InspectionStatus.COMPLETED,
    ).exclude(review_status=ReviewStatus.REJECTED)
    alerts = MaintenanceAlert.objects.filter(created_at__date__gte=date_from, created_at__date__lte=date_to)
    assets = StructuralAsset.objects.filter(is_archived=False)

    # The health index carries scores forward, so it needs history before date_from.
    trend_inspections = InspectionLog.objects.filter(inspection_date__date__lte=date_to)
    if filters.get("asset"):
        trend_inspections = trend_inspections.filter(structural_asset_id=filters["asset"])
    if filters.get("asset_type"):
        trend_inspections = trend_inspections.filter(structural_asset__asset_type__in=filters["asset_type"])

    if filters.get("asset"):
        inspections = inspections.filter(structural_asset_id=filters["asset"])
        detections = detections.filter(inspection__structural_asset_id=filters["asset"])
        alerts = alerts.filter(structural_asset_id=filters["asset"])
        assets = assets.filter(pk=filters["asset"])
    if filters.get("asset_type"):
        inspections = inspections.filter(structural_asset__asset_type__in=filters["asset_type"])
        detections = detections.filter(inspection__structural_asset__asset_type__in=filters["asset_type"])
        alerts = alerts.filter(structural_asset__asset_type__in=filters["asset_type"])
        assets = assets.filter(asset_type__in=filters["asset_type"])
    if filters.get("defect_type"):
        detections = detections.filter(defect_type__in=filters["defect_type"])
        inspections = inspections.filter(detections__defect_type__in=filters["defect_type"]).distinct()
        alerts = alerts.filter(defect_type__in=filters["defect_type"])
    if filters.get("severity"):
        detections = detections.filter(severity__in=filters["severity"])
        inspections = inspections.filter(max_severity__in=filters["severity"])
        alerts = alerts.filter(severity__in=filters["severity"])

    # Inspections per month (by outcome)
    per_month = {
        _month_key(r["month"]): r
        for r in inspections.annotate(month=TruncMonth("inspection_date"))
        .values("month")
        .annotate(
            total=Count("id", distinct=True),
            completed=Count("id", filter=Q(status=InspectionStatus.COMPLETED), distinct=True),
            failed=Count("id", filter=Q(status=InspectionStatus.FAILED), distinct=True),
            avg_time=Avg("processing_time", filter=Q(status=InspectionStatus.COMPLETED)),
        )
    }
    inspections_per_month = [
        {
            "month": m,
            "total": per_month.get(m, {}).get("total", 0),
            "completed": per_month.get(m, {}).get("completed", 0),
            "failed": per_month.get(m, {}).get("failed", 0),
        }
        for m in months
    ]
    processing_time = [
        {"month": m, "avg_seconds": round(per_month[m]["avg_time"], 2) if m in per_month and per_month[m]["avg_time"] else None}
        for m in months
    ]

    # Detection breakdowns
    labels = dict(DefectType.choices)
    defects_by_type = [
        {"defect_type": r["defect_type"], "label": labels.get(r["defect_type"], r["defect_type"]), "count": r["count"], "avg_confidence": round(r["avg_conf"], 3)}
        for r in detections.values("defect_type").annotate(count=Count("id"), avg_conf=Avg("confidence_score")).order_by("-count")
    ]
    sev_rows = {r["severity"]: r["count"] for r in detections.values("severity").annotate(count=Count("id"))}
    defects_by_severity = [{"severity": s, "count": sev_rows.get(s, 0)} for s in ("LOW", "MEDIUM", "HIGH", "CRITICAL")]

    det_month = {
        _month_key(r["month"]): r
        for r in detections.annotate(month=TruncMonth("inspection__inspection_date"))
        .values("month")
        .annotate(
            avg_conf=Avg("confidence_score"),
            critical=Count("id", filter=Q(severity=Severity.CRITICAL)),
            high=Count("id", filter=Q(severity=Severity.HIGH)),
            total=Count("id"),
        )
    }
    confidence_trend = [
        {"month": m, "avg_confidence": round(det_month[m]["avg_conf"], 3) if m in det_month else None}
        for m in months
    ]
    critical_incidents = [
        {"month": m, "critical": det_month.get(m, {}).get("critical", 0), "high": det_month.get(m, {}).get("high", 0)}
        for m in months
    ]

    # Maintenance trends: alerts opened vs resolved and mean time to resolve
    opened = {
        _month_key(r["month"]): r["count"]
        for r in alerts.annotate(month=TruncMonth("created_at")).values("month").annotate(count=Count("id"))
    }
    resolved_qs = alerts.filter(status=AlertStatus.RESOLVED, resolved_at__isnull=False)
    resolved = {
        _month_key(r["month"]): r["count"]
        for r in resolved_qs.annotate(month=TruncMonth("resolved_at")).values("month").annotate(count=Count("id"))
    }
    resolution_hours = [
        (a.resolved_at - a.created_at).total_seconds() / 3600 for a in resolved_qs.only("created_at", "resolved_at")[:2000]
    ]
    maintenance_trend = [{"month": m, "opened": opened.get(m, 0), "resolved": resolved.get(m, 0)} for m in months]

    risk_rows = {r["risk_level"]: r["count"] for r in assets.values("risk_level").annotate(count=Count("id"))}
    risk_distribution = [{"risk_level": level, "count": risk_rows.get(level, 0)} for level in RiskLevel.values]

    type_health = [
        {"asset_type": r["asset_type"], "avg_health": round(r["avg"], 1) if r["avg"] is not None else None, "count": r["count"]}
        for r in assets.values("asset_type").annotate(avg=Avg("current_health_score"), count=Count("id")).order_by("asset_type")
    ]

    top_risk_assets = list(
        assets.exclude(current_health_score__isnull=True)
        .order_by("current_health_score")
        .values("id", "asset_code", "asset_name", "asset_type", "current_health_score", "risk_level")[:8]
    )

    totals = detections.aggregate(total=Count("id"), avg_conf=Avg("confidence_score"))
    insp_totals = inspections.aggregate(
        total=Count("id", distinct=True),
        completed=Count("id", filter=Q(status=InspectionStatus.COMPLETED), distinct=True),
        avg_time=Avg("processing_time", filter=Q(status=InspectionStatus.COMPLETED)),
        demo=Count("id", filter=Q(inference_mode="demo"), distinct=True),
    )

    return {
        "filters": {k: v for k, v in filters.items() if v},
        "range": {"date_from": date_from, "date_to": date_to},
        "totals": {
            "inspections": insp_totals["total"],
            "completed_inspections": insp_totals["completed"],
            "demo_inspections": insp_totals["demo"],
            "detections": totals["total"],
            "avg_confidence": round(totals["avg_conf"], 3) if totals["avg_conf"] is not None else None,
            "avg_processing_time": round(insp_totals["avg_time"], 2) if insp_totals["avg_time"] else None,
            "alerts_opened": alerts.count(),
            "alerts_resolved": resolved_qs.count(),
            "mean_time_to_resolve_hours": round(sum(resolution_hours) / len(resolution_hours), 1) if resolution_hours else None,
        },
        "health_trend": health_trend(trend_inspections, months),
        "defects_by_type": defects_by_type,
        "defects_by_severity": defects_by_severity,
        "inspections_per_month": inspections_per_month,
        "critical_incidents": critical_incidents,
        "risk_distribution": risk_distribution,
        "confidence_trend": confidence_trend,
        "processing_time": processing_time,
        "maintenance_trend": maintenance_trend,
        "health_by_asset_type": type_health,
        "top_risk_assets": top_risk_assets,
    }
