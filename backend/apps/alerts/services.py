"""Rules that turn AI inspection results into maintenance alerts."""

from __future__ import annotations

import logging
from collections import defaultdict

from django.db import transaction
from django.utils import timezone

from apps.core.choices import Severity
from apps.core.models import PlatformConfiguration

from .models import AlertStatus, AlertType, MaintenanceAlert

logger = logging.getLogger(__name__)

ALLOWED_TRANSITIONS = {
    AlertStatus.OPEN: {AlertStatus.INVESTIGATING, AlertStatus.RESOLVED},
    AlertStatus.INVESTIGATING: {AlertStatus.OPEN, AlertStatus.RESOLVED},
    AlertStatus.RESOLVED: {AlertStatus.OPEN},
}


def create_alerts_for_inspection(inspection, previous_score: float | None) -> list[MaintenanceAlert]:
    """Create alerts for severe detections and significant health declines.

    One alert is raised per defect type (not per bounding box) to avoid alert
    fatigue; it carries the highest severity seen for that type.
    """
    from apps.inspections.models import DefectType

    config = PlatformConfiguration.load()
    if not config.auto_alerts_enabled:
        return []

    asset = inspection.structural_asset
    min_rank = Severity.rank(config.alert_min_severity)
    grouped: dict[str, list] = defaultdict(list)
    for detection in inspection.detections.all():
        if Severity.rank(detection.severity) >= min_rank and detection.confidence_score >= config.alert_min_confidence:
            grouped[detection.defect_type].append(detection)

    created: list[MaintenanceAlert] = []
    demo_note = " (demo inference result)" if inspection.inference_mode == "demo" else ""
    for defect_type, detections in grouped.items():
        severity = Severity.max(d.severity for d in detections)
        label = DefectType(defect_type).label
        best = max(detections, key=lambda d: d.confidence_score)
        created.append(
            MaintenanceAlert.objects.create(
                structural_asset=asset,
                inspection=inspection,
                alert_type=AlertType.DEFECT_DETECTED,
                defect_type=defect_type,
                severity=severity,
                title=f"{Severity(severity).label} {label.lower()} detected on {asset.asset_name}",
                description=(
                    f"AI inspection {inspection.reference} detected {len(detections)} {label.lower()} finding(s)"
                    f" rated {Severity(severity).label.lower()} or above (highest confidence {best.confidence_score:.0%}){demo_note}. "
                    "Verify on site before planning intervention."
                ),
            )
        )

    new_score = inspection.overall_health_score
    if previous_score is not None and new_score is not None:
        drop = previous_score - new_score
        if drop >= config.health_drop_alert_points:
            severity = Severity.HIGH if new_score < config.critical_threshold or drop >= 2 * config.health_drop_alert_points else Severity.MEDIUM
            created.append(
                MaintenanceAlert.objects.create(
                    structural_asset=asset,
                    inspection=inspection,
                    alert_type=AlertType.HEALTH_DECLINE,
                    severity=severity,
                    title=f"Health score dropped {drop:.0f} points on {asset.asset_name}",
                    description=(
                        f"Structural health fell from {previous_score:.0f} to {new_score:.0f} between consecutive inspections"
                        f" ({inspection.reference}){demo_note}."
                    ),
                )
            )

    if created:
        from apps.inspections.realtime import broadcast_alert_created

        def _notify():
            for alert in created:
                broadcast_alert_created(alert)

        transaction.on_commit(_notify)
    return created


def transition_alert(alert: MaintenanceAlert, new_status: str, user, notes: str = "") -> MaintenanceAlert:
    from rest_framework.exceptions import ValidationError

    if new_status == alert.status:
        return alert
    if new_status not in ALLOWED_TRANSITIONS.get(alert.status, set()):
        raise ValidationError({"status": f"Cannot move an alert from {alert.get_status_display()} to {AlertStatus(new_status).label}."})
    alert.status = new_status
    if new_status == AlertStatus.RESOLVED:
        alert.resolved_at = timezone.now()
        alert.resolved_by = user
        if notes:
            alert.resolution_notes = notes
    else:
        alert.resolved_at = None
        alert.resolved_by = None
    alert.save()
    return alert


def flag_overdue_assets() -> int:
    """Raise one open 'inspection overdue' alert per asset past its inspection interval."""
    from datetime import timedelta

    from apps.assets.models import StructuralAsset

    now = timezone.now()
    # Interval arithmetic is done in Python so the rule behaves identically on every database.
    candidates = [
        asset
        for asset in StructuralAsset.objects.filter(is_archived=False, last_inspection_at__isnull=False).only(
            "id", "asset_name", "last_inspection_at", "inspection_interval_days"
        )
        if asset.last_inspection_at < now - timedelta(days=asset.inspection_interval_days)
    ]
    created = 0
    for asset in candidates:
        exists = MaintenanceAlert.objects.filter(
            structural_asset=asset,
            alert_type=AlertType.INSPECTION_OVERDUE,
            status__in=[AlertStatus.OPEN, AlertStatus.INVESTIGATING],
        ).exists()
        if exists:
            continue
        days = (now - asset.last_inspection_at).days
        MaintenanceAlert.objects.create(
            structural_asset=asset,
            alert_type=AlertType.INSPECTION_OVERDUE,
            severity=Severity.MEDIUM if days > asset.inspection_interval_days * 1.5 else Severity.LOW,
            title=f"Inspection overdue for {asset.asset_name}",
            description=f"Last inspected {days} days ago; the configured interval is {asset.inspection_interval_days} days.",
        )
        created += 1
    logger.info("Flagged %s overdue asset(s)", created)
    return created
