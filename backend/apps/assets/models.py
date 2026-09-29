from __future__ import annotations

import uuid

from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models

from apps.core.choices import HealthStatus, RiskLevel
from apps.core.models import TimeStampedModel


class AssetType(models.TextChoices):
    BRIDGE = "BRIDGE", "Bridge"
    ROAD = "ROAD", "Road"
    BUILDING = "BUILDING", "Building"
    TUNNEL = "TUNNEL", "Tunnel"
    TOWER = "TOWER", "Tower"
    DAM = "DAM", "Dam"
    INDUSTRIAL = "INDUSTRIAL", "Industrial Structure"
    OTHER = "OTHER", "Other"


class MaterialType(models.TextChoices):
    REINFORCED_CONCRETE = "REINFORCED_CONCRETE", "Reinforced Concrete"
    PRESTRESSED_CONCRETE = "PRESTRESSED_CONCRETE", "Prestressed Concrete"
    STRUCTURAL_STEEL = "STRUCTURAL_STEEL", "Structural Steel"
    MASONRY = "MASONRY", "Masonry"
    ASPHALT = "ASPHALT", "Asphalt"
    TIMBER = "TIMBER", "Timber"
    COMPOSITE = "COMPOSITE", "Composite"
    OTHER = "OTHER", "Other"


class StructuralAsset(TimeStampedModel):
    asset_code = models.CharField(max_length=20, unique=True, editable=False)
    asset_name = models.CharField(max_length=160, db_index=True)
    asset_type = models.CharField(max_length=20, choices=AssetType.choices, db_index=True)
    material_type = models.CharField(max_length=30, choices=MaterialType.choices)
    description = models.TextField(blank=True)

    latitude = models.DecimalField(
        max_digits=9, decimal_places=6, null=True, blank=True,
        validators=[MinValueValidator(-90), MaxValueValidator(90)],
    )
    longitude = models.DecimalField(
        max_digits=9, decimal_places=6, null=True, blank=True,
        validators=[MinValueValidator(-180), MaxValueValidator(180)],
    )
    location = models.CharField(max_length=200, help_text="Human readable location, e.g. city / corridor.")
    region = models.CharField(max_length=80, blank=True, db_index=True)

    installation_date = models.DateField(null=True, blank=True)
    structural_system = models.CharField(max_length=120, blank=True, help_text="e.g. Box girder, Portal frame")
    dimensions = models.CharField(max_length=120, blank=True, help_text="e.g. 420 m x 18 m, 4 lanes")
    operator = models.CharField(max_length=120, blank=True)
    inspection_interval_days = models.PositiveIntegerField(default=180)

    current_health_score = models.FloatField(
        null=True, blank=True, validators=[MinValueValidator(0), MaxValueValidator(100)], db_index=True
    )
    health_status = models.CharField(max_length=10, choices=HealthStatus.choices, null=True, blank=True, db_index=True)
    risk_level = models.CharField(max_length=10, choices=RiskLevel.choices, default=RiskLevel.LOW, db_index=True)
    last_inspection_at = models.DateTimeField(null=True, blank=True, db_index=True)

    is_archived = models.BooleanField(default=False, db_index=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="assets_created"
    )

    class Meta:
        ordering = ("asset_name",)
        indexes = [models.Index(fields=["asset_type", "risk_level"])]

    def __str__(self) -> str:
        return f"{self.asset_code} · {self.asset_name}"

    def save(self, *args, **kwargs):
        creating = self.pk is None
        if creating and not self.asset_code:
            self.asset_code = f"TMP-{uuid.uuid4().hex[:16]}"
        super().save(*args, **kwargs)
        if creating and self.asset_code.startswith("TMP-"):
            self.asset_code = f"AST-{self.pk:04d}"
            super().save(update_fields=["asset_code"])

    @property
    def age_years(self) -> float | None:
        if not self.installation_date:
            return None
        from django.utils import timezone

        return round((timezone.now().date() - self.installation_date).days / 365.25, 1)
