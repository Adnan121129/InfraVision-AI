from __future__ import annotations

from django.conf import settings
from django.core.cache import cache
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models

from .choices import HealthStatus, RiskLevel


class TimeStampedModel(models.Model):
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class PlatformConfiguration(models.Model):
    """Singleton row holding operator-tunable platform behaviour.

    Administrators edit it from the Settings page. Values are cached because
    they are read on every inspection completion.
    """

    CACHE_KEY = "platform-configuration:v1"

    organization_name = models.CharField(max_length=120, default="InfraVision Operations")
    healthy_threshold = models.FloatField(
        default=75.0,
        validators=[MinValueValidator(0), MaxValueValidator(100)],
        help_text="Assets scoring at or above this value are considered healthy.",
    )
    critical_threshold = models.FloatField(
        default=50.0,
        validators=[MinValueValidator(0), MaxValueValidator(100)],
        help_text="Assets scoring below this value are considered critical.",
    )
    alert_min_severity = models.CharField(
        max_length=10,
        default="HIGH",
        choices=[("MEDIUM", "Medium"), ("HIGH", "High"), ("CRITICAL", "Critical")],
        help_text="Detections at or above this severity raise a maintenance alert.",
    )
    alert_min_confidence = models.FloatField(
        default=0.6,
        validators=[MinValueValidator(0), MaxValueValidator(1)],
        help_text="Detections below this model confidence never raise alerts on their own.",
    )
    health_drop_alert_points = models.FloatField(
        default=10.0,
        validators=[MinValueValidator(1), MaxValueValidator(100)],
        help_text="Raise a health-decline alert when a score drops by at least this many points.",
    )
    default_inspection_interval_days = models.PositiveIntegerField(default=180)
    auto_alerts_enabled = models.BooleanField(default=True)
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )

    class Meta:
        verbose_name = "platform configuration"
        verbose_name_plural = "platform configuration"

    def __str__(self) -> str:
        return f"Platform configuration ({self.organization_name})"

    def save(self, *args, **kwargs):
        self.pk = 1
        super().save(*args, **kwargs)
        cache.delete(self.CACHE_KEY)

    @classmethod
    def load(cls) -> "PlatformConfiguration":
        config = cache.get(cls.CACHE_KEY)
        if config is None:
            config, _ = cls.objects.get_or_create(
                pk=1,
                defaults={
                    "healthy_threshold": settings.DEFAULT_HEALTHY_THRESHOLD,
                    "critical_threshold": settings.DEFAULT_CRITICAL_THRESHOLD,
                },
            )
            cache.set(cls.CACHE_KEY, config, 300)
        return config

    # -- Derived classifications -------------------------------------------------
    def health_status_for(self, score: float | None) -> str | None:
        if score is None:
            return None
        if score >= self.healthy_threshold:
            return HealthStatus.HEALTHY
        if score >= self.critical_threshold:
            return HealthStatus.WARNING
        return HealthStatus.CRITICAL

    def risk_level_for(self, score: float | None, max_open_severity: str | None = None) -> str:
        """Risk combines the structural health score with unresolved severe findings."""
        if score is None:
            # Not yet scored by AI: only unresolved findings can raise the risk.
            return {"CRITICAL": RiskLevel.CRITICAL, "HIGH": RiskLevel.HIGH}.get(max_open_severity, RiskLevel.LOW)
        if score < self.critical_threshold - 15 or max_open_severity == "CRITICAL":
            return RiskLevel.CRITICAL
        if score < self.critical_threshold or max_open_severity == "HIGH":
            return RiskLevel.HIGH
        if score < self.healthy_threshold:
            return RiskLevel.MEDIUM
        return RiskLevel.LOW
