from __future__ import annotations

import uuid

from django.conf import settings
from django.db import models

from apps.core.choices import Severity


class AlertStatus(models.TextChoices):
    OPEN = "OPEN", "Open"
    INVESTIGATING = "INVESTIGATING", "Investigating"
    RESOLVED = "RESOLVED", "Resolved"


class AlertType(models.TextChoices):
    DEFECT_DETECTED = "DEFECT_DETECTED", "Defect detected"
    HEALTH_DECLINE = "HEALTH_DECLINE", "Health decline"
    INSPECTION_OVERDUE = "INSPECTION_OVERDUE", "Inspection overdue"


class MaintenanceAlert(models.Model):
    reference = models.CharField(max_length=20, unique=True, editable=False)
    structural_asset = models.ForeignKey("assets.StructuralAsset", on_delete=models.CASCADE, related_name="alerts")
    inspection = models.ForeignKey(
        "inspections.InspectionLog", null=True, blank=True, on_delete=models.SET_NULL, related_name="alerts"
    )
    alert_type = models.CharField(max_length=24, choices=AlertType.choices, default=AlertType.DEFECT_DETECTED, db_index=True)
    defect_type = models.CharField(max_length=20, blank=True, db_index=True)
    title = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    severity = models.CharField(max_length=10, choices=Severity.choices, db_index=True)
    status = models.CharField(max_length=14, choices=AlertStatus.choices, default=AlertStatus.OPEN, db_index=True)
    assigned_to = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="assigned_alerts"
    )
    resolution_notes = models.TextField(blank=True)
    resolved_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)
    resolved_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ("-created_at",)
        indexes = [models.Index(fields=["status", "severity"])]

    def __str__(self) -> str:
        return f"{self.reference} {self.title}"

    def save(self, *args, **kwargs):
        creating = self.pk is None
        if creating and not self.reference:
            self.reference = f"TMP-{uuid.uuid4().hex[:16]}"
        super().save(*args, **kwargs)
        if creating and self.reference.startswith("TMP-"):
            self.reference = f"ALR-{500 + self.pk}"
            super().save(update_fields=["reference"])
