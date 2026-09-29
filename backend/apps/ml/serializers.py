from rest_framework import serializers

from .models import MLModel


class MLModelSerializer(serializers.ModelSerializer):
    framework_display = serializers.CharField(source="get_framework_display", read_only=True)
    inspections_processed = serializers.IntegerField(read_only=True, default=0)
    avg_processing_time = serializers.FloatField(read_only=True, default=None)
    avg_confidence = serializers.FloatField(read_only=True, default=None)
    detections_count = serializers.IntegerField(read_only=True, default=0)
    failed_inspections = serializers.IntegerField(read_only=True, default=0)
    last_used_at = serializers.DateTimeField(read_only=True, default=None)

    class Meta:
        model = MLModel
        fields = (
            "id",
            "model_name",
            "version",
            "framework",
            "framework_display",
            "architecture",
            "task",
            "description",
            "is_demo",
            "accuracy",
            "precision",
            "recall",
            "f1_score",
            "training_dataset",
            "classes",
            "input_size",
            "artifact_uri",
            "status",
            "deployed_at",
            "last_heartbeat_at",
            "created_at",
            "inspections_processed",
            "failed_inspections",
            "avg_processing_time",
            "avg_confidence",
            "detections_count",
            "last_used_at",
        )
        read_only_fields = tuple(f for f in fields if f not in ("description", "status"))
