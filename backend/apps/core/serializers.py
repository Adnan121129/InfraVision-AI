from rest_framework import serializers

from .models import PlatformConfiguration


class PlatformConfigurationSerializer(serializers.ModelSerializer):
    updated_by_name = serializers.CharField(source="updated_by.get_full_name", read_only=True, default=None)

    class Meta:
        model = PlatformConfiguration
        fields = (
            "organization_name",
            "healthy_threshold",
            "critical_threshold",
            "alert_min_severity",
            "alert_min_confidence",
            "health_drop_alert_points",
            "default_inspection_interval_days",
            "auto_alerts_enabled",
            "updated_at",
            "updated_by_name",
        )
        read_only_fields = ("updated_at", "updated_by_name")

    def validate(self, attrs):
        healthy = attrs.get("healthy_threshold", getattr(self.instance, "healthy_threshold", 75))
        critical = attrs.get("critical_threshold", getattr(self.instance, "critical_threshold", 50))
        if critical >= healthy:
            raise serializers.ValidationError(
                {"critical_threshold": "The critical threshold must be lower than the healthy threshold."}
            )
        return attrs
