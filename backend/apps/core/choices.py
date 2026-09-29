"""Enumerations shared across apps so that severity and health semantics stay consistent."""

from django.db import models


class Severity(models.TextChoices):
    LOW = "LOW", "Low"
    MEDIUM = "MEDIUM", "Medium"
    HIGH = "HIGH", "High"
    CRITICAL = "CRITICAL", "Critical"

    @classmethod
    def rank(cls, value: str | None) -> int:
        order = {cls.LOW: 1, cls.MEDIUM: 2, cls.HIGH: 3, cls.CRITICAL: 4}
        return order.get(value, 0)

    @classmethod
    def max(cls, values) -> str | None:
        values = [v for v in values if v]
        if not values:
            return None
        return max(values, key=cls.rank)


class RiskLevel(models.TextChoices):
    LOW = "LOW", "Low"
    MEDIUM = "MEDIUM", "Medium"
    HIGH = "HIGH", "High"
    CRITICAL = "CRITICAL", "Critical"


class HealthStatus(models.TextChoices):
    HEALTHY = "HEALTHY", "Healthy"
    WARNING = "WARNING", "Warning"
    CRITICAL = "CRITICAL", "Critical"


class InferenceMode(models.TextChoices):
    DEMO = "demo", "Demo (mock inference)"
    PRODUCTION = "production", "Production model"
