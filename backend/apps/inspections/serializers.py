from __future__ import annotations

from datetime import timedelta

from django.utils import timezone
from rest_framework import serializers

from apps.assets.models import StructuralAsset
from apps.core.storage import object_storage

from .models import DefectDetection, ImageRecord, InspectionLog


class _StorageUrlMixin:
    def _url(self, key: str | None) -> str | None:
        return object_storage.url(key, self.context.get("request")) if key else None


class ImageRecordSerializer(_StorageUrlMixin, serializers.ModelSerializer):
    thumbnail_url = serializers.SerializerMethodField()
    preview_url = serializers.SerializerMethodField()
    annotated_url = serializers.SerializerMethodField()
    original_url = serializers.SerializerMethodField()
    detections_count = serializers.IntegerField(read_only=True, default=None)

    class Meta:
        model = ImageRecord
        fields = (
            "id",
            "inspection",
            "original_filename",
            "content_type",
            "file_size",
            "image_width",
            "image_height",
            "health_score",
            "thumbnail_url",
            "preview_url",
            "annotated_url",
            "original_url",
            "detections_count",
            "uploaded_at",
        )

    def get_thumbnail_url(self, obj) -> str | None:
        return self._url(obj.thumbnail_key or obj.preview_key or obj.storage_key)

    def get_preview_url(self, obj) -> str | None:
        # Fall back to the original only until the preview derivative exists.
        return self._url(obj.preview_key or obj.storage_key)

    def get_annotated_url(self, obj) -> str | None:
        return self._url(obj.annotated_key)

    def get_original_url(self, obj) -> str | None:
        return self._url(obj.storage_key)


class DefectDetectionSerializer(serializers.ModelSerializer):
    defect_type_display = serializers.CharField(source="get_defect_type_display", read_only=True)
    reviewed_by_name = serializers.SerializerMethodField()

    class Meta:
        model = DefectDetection
        fields = (
            "id",
            "inspection",
            "image_record",
            "defect_type",
            "defect_type_display",
            "severity",
            "confidence_score",
            "x_min",
            "y_min",
            "x_max",
            "y_max",
            "area_ratio",
            "description",
            "review_status",
            "reviewed_by_name",
            "reviewed_at",
            "created_at",
        )
        read_only_fields = tuple(f for f in fields if f != "review_status")

    def get_reviewed_by_name(self, obj) -> str | None:
        return obj.reviewed_by.get_full_name() if obj.reviewed_by else None


class DefectExplorerSerializer(_StorageUrlMixin, DefectDetectionSerializer):
    """Detection enriched with its asset and image, for the fleet-wide AI Analysis view."""

    inspection_reference = serializers.CharField(source="inspection.reference", read_only=True)
    inspection_date = serializers.DateTimeField(source="inspection.inspection_date", read_only=True)
    inference_mode = serializers.CharField(source="inspection.inference_mode", read_only=True)
    asset_id = serializers.IntegerField(source="inspection.structural_asset_id", read_only=True)
    asset_name = serializers.CharField(source="inspection.structural_asset.asset_name", read_only=True)
    image_width = serializers.IntegerField(source="image_record.image_width", read_only=True)
    image_height = serializers.IntegerField(source="image_record.image_height", read_only=True)
    image_url = serializers.SerializerMethodField()

    class Meta(DefectDetectionSerializer.Meta):
        fields = DefectDetectionSerializer.Meta.fields + (
            "inspection_reference",
            "inspection_date",
            "inference_mode",
            "asset_id",
            "asset_name",
            "image_width",
            "image_height",
            "image_url",
        )
        read_only_fields = fields

    def get_image_url(self, obj) -> str | None:
        image = obj.image_record
        return self._url(image.preview_key or image.storage_key)


class InspectionListSerializer(_StorageUrlMixin, serializers.ModelSerializer):
    asset_name = serializers.CharField(source="structural_asset.asset_name", read_only=True)
    asset_code = serializers.CharField(source="structural_asset.asset_code", read_only=True)
    asset_type = serializers.CharField(source="structural_asset.asset_type", read_only=True)
    inspection_type_display = serializers.CharField(source="get_inspection_type_display", read_only=True)
    inspector_name = serializers.SerializerMethodField()
    images_count = serializers.IntegerField(read_only=True, default=0)
    thumbnail_url = serializers.SerializerMethodField()

    class Meta:
        model = InspectionLog
        fields = (
            "id",
            "reference",
            "structural_asset",
            "asset_name",
            "asset_code",
            "asset_type",
            "inspection_date",
            "inspection_type",
            "inspection_type_display",
            "status",
            "processing_stage",
            "health_status",
            "overall_health_score",
            "defect_count",
            "max_severity",
            "inspector_name",
            "model_version",
            "inference_mode",
            "processing_time",
            "images_count",
            "thumbnail_url",
            "error_message",
            "created_at",
            "completed_at",
        )

    def get_inspector_name(self, obj) -> str | None:
        return (obj.inspector.get_full_name() or obj.inspector.email) if obj.inspector else None

    def get_thumbnail_url(self, obj) -> str | None:
        first = getattr(obj, "first_thumbnail_key", None)
        return self._url(first)


class InspectionDetailSerializer(InspectionListSerializer):
    images = ImageRecordSerializer(many=True, read_only=True)
    ml_model_detail = serializers.SerializerMethodField()

    class Meta(InspectionListSerializer.Meta):
        fields = InspectionListSerializer.Meta.fields + (
            "notes",
            "celery_task_id",
            "attempts",
            "queued_at",
            "started_at",
            "updated_at",
            "summary",
            "preprocessing_report",
            "images",
            "ml_model_detail",
        )

    def get_ml_model_detail(self, obj) -> dict | None:
        model = obj.ml_model
        if model is None:
            return None
        return {
            "id": model.pk,
            "model_name": model.model_name,
            "version": model.version,
            "framework": model.get_framework_display(),
            "architecture": model.architecture,
            "is_demo": model.is_demo,
            "accuracy": model.accuracy,
        }


class InspectionCreateSerializer(serializers.ModelSerializer):
    structural_asset = serializers.PrimaryKeyRelatedField(queryset=StructuralAsset.objects.filter(is_archived=False))

    class Meta:
        model = InspectionLog
        fields = ("id", "reference", "structural_asset", "inspection_type", "inspection_date", "notes")
        read_only_fields = ("id", "reference")

    def validate_inspection_date(self, value):
        if value and value > timezone.now() + timedelta(minutes=5):
            raise serializers.ValidationError("The inspection date cannot be in the future.")
        return value


class InspectionUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = InspectionLog
        fields = ("inspection_type", "inspection_date", "notes")


class InspectionStatusSerializer(serializers.ModelSerializer):
    class Meta:
        model = InspectionLog
        fields = (
            "id",
            "reference",
            "status",
            "processing_stage",
            "overall_health_score",
            "defect_count",
            "max_severity",
            "error_message",
            "inference_mode",
            "queued_at",
            "started_at",
            "completed_at",
            "updated_at",
        )


class ImageUploadSerializer(serializers.Serializer):
    inspection = serializers.PrimaryKeyRelatedField(queryset=InspectionLog.objects.select_related("structural_asset"))
    file = serializers.FileField(allow_empty_file=False, use_url=False)


class DetectionReviewSerializer(serializers.ModelSerializer):
    class Meta:
        model = DefectDetection
        fields = ("review_status",)
