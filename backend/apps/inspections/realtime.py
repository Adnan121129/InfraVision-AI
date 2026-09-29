"""Push inspection lifecycle events to connected dashboards over WebSockets."""

from __future__ import annotations

import logging

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer

logger = logging.getLogger(__name__)

INSPECTIONS_GROUP = "inspections"


def _send(group: str, message: dict) -> None:
    layer = get_channel_layer()
    if layer is None:
        return
    try:
        async_to_sync(layer.group_send)(group, message)
    except Exception:  # real-time delivery is best effort; clients fall back to polling
        logger.warning("Could not broadcast realtime event", exc_info=True)


def inspection_payload(inspection) -> dict:
    asset = inspection.structural_asset
    return {
        "id": inspection.pk,
        "reference": inspection.reference,
        "status": inspection.status,
        "processing_stage": inspection.processing_stage,
        "asset_id": asset.pk,
        "asset_name": asset.asset_name,
        "defect_count": inspection.defect_count,
        "overall_health_score": inspection.overall_health_score,
        "max_severity": inspection.max_severity,
        "inference_mode": inspection.inference_mode,
        "error_message": inspection.error_message,
        "updated_at": inspection.updated_at.isoformat() if inspection.updated_at else None,
    }


def broadcast_inspection_update(inspection, message: str, level: str = "info", kind: str = "stage") -> None:
    """``kind`` is one of queued | started | stage | completed | failed."""
    _send(
        INSPECTIONS_GROUP,
        {"type": "inspection.update", "kind": kind, "inspection": inspection_payload(inspection), "message": message, "level": level},
    )


def broadcast_alert_created(alert) -> None:
    _send(
        INSPECTIONS_GROUP,
        {
            "type": "alert.created",
            "alert": {
                "id": alert.pk,
                "reference": alert.reference,
                "title": alert.title,
                "severity": alert.severity,
                "asset_id": alert.structural_asset_id,
            },
            "message": f"{alert.get_severity_display()} alert: {alert.title}",
            "level": "error" if alert.severity == "CRITICAL" else "warning",
        },
    )
