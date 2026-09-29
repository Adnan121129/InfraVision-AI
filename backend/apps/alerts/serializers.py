from rest_framework import serializers

from apps.users.serializers import UserSummarySerializer

from .models import AlertStatus, MaintenanceAlert


class MaintenanceAlertSerializer(serializers.ModelSerializer):
    asset_name = serializers.CharField(source="structural_asset.asset_name", read_only=True)
    asset_code = serializers.CharField(source="structural_asset.asset_code", read_only=True)
    asset_type = serializers.CharField(source="structural_asset.asset_type", read_only=True)
    inspection_reference = serializers.CharField(source="inspection.reference", read_only=True, default=None)
    alert_type_display = serializers.CharField(source="get_alert_type_display", read_only=True)
    defect_type_display = serializers.SerializerMethodField()
    assigned_to_detail = UserSummarySerializer(source="assigned_to", read_only=True)
    resolved_by_name = serializers.SerializerMethodField()

    class Meta:
        model = MaintenanceAlert
        fields = (
            "id",
            "reference",
            "structural_asset",
            "asset_name",
            "asset_code",
            "asset_type",
            "inspection",
            "inspection_reference",
            "alert_type",
            "alert_type_display",
            "defect_type",
            "defect_type_display",
            "title",
            "description",
            "severity",
            "status",
            "assigned_to",
            "assigned_to_detail",
            "resolution_notes",
            "resolved_by_name",
            "created_at",
            "updated_at",
            "resolved_at",
        )
        read_only_fields = (
            "reference",
            "structural_asset",
            "inspection",
            "alert_type",
            "defect_type",
            "title",
            "description",
            "severity",
            "created_at",
            "updated_at",
            "resolved_at",
        )

    def get_defect_type_display(self, obj) -> str | None:
        if not obj.defect_type:
            return None
        from apps.inspections.models import DefectType

        try:
            return DefectType(obj.defect_type).label
        except ValueError:
            return obj.defect_type

    def get_resolved_by_name(self, obj) -> str | None:
        return obj.resolved_by.get_full_name() if obj.resolved_by else None


class AlertUpdateSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=AlertStatus.choices, required=False)
    assigned_to = serializers.IntegerField(required=False, allow_null=True)
    resolution_notes = serializers.CharField(required=False, allow_blank=True, max_length=4000)
