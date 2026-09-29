from __future__ import annotations

from rest_framework import serializers

from .models import StructuralAsset


class StructuralAssetSerializer(serializers.ModelSerializer):
    asset_type_display = serializers.CharField(source="get_asset_type_display", read_only=True)
    material_type_display = serializers.CharField(source="get_material_type_display", read_only=True)
    open_alerts_count = serializers.IntegerField(read_only=True, default=0)
    inspections_count = serializers.IntegerField(read_only=True, default=0)
    age_years = serializers.FloatField(read_only=True)

    class Meta:
        model = StructuralAsset
        fields = (
            "id",
            "asset_code",
            "asset_name",
            "asset_type",
            "asset_type_display",
            "material_type",
            "material_type_display",
            "description",
            "latitude",
            "longitude",
            "location",
            "region",
            "installation_date",
            "age_years",
            "structural_system",
            "dimensions",
            "operator",
            "inspection_interval_days",
            "current_health_score",
            "health_status",
            "risk_level",
            "last_inspection_at",
            "is_archived",
            "open_alerts_count",
            "inspections_count",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "asset_code",
            "current_health_score",
            "health_status",
            "risk_level",
            "last_inspection_at",
            "is_archived",
            "created_at",
            "updated_at",
        )

    def validate(self, attrs):
        lat = attrs.get("latitude", getattr(self.instance, "latitude", None))
        lng = attrs.get("longitude", getattr(self.instance, "longitude", None))
        if (lat is None) != (lng is None):
            raise serializers.ValidationError("Latitude and longitude must be provided together.")
        return attrs


class AssetMapSerializer(serializers.ModelSerializer):
    open_alerts_count = serializers.IntegerField(read_only=True, default=0)
    asset_type_display = serializers.CharField(source="get_asset_type_display", read_only=True)

    class Meta:
        model = StructuralAsset
        fields = (
            "id",
            "asset_code",
            "asset_name",
            "asset_type",
            "asset_type_display",
            "latitude",
            "longitude",
            "location",
            "current_health_score",
            "health_status",
            "risk_level",
            "last_inspection_at",
            "open_alerts_count",
        )


class AssetOptionSerializer(serializers.ModelSerializer):
    class Meta:
        model = StructuralAsset
        fields = ("id", "asset_code", "asset_name", "asset_type", "location")
