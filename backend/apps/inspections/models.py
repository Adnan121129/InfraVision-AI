from __future__ import annotations

import uuid

from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.utils import timezone

from apps.core.choices import HealthStatus, InferenceMode, Severity


class InspectionStatus(models.TextChoices):
    PENDING = "PENDING", "Pending"
    QUEUED = "QUEUED", "Queued"
    PROCESSING = "PROCESSING", "Processing"
    COMPLETED = "COMPLETED", "Completed"
    FAILED = "FAILED", "Failed"


class ProcessingStage(models.TextChoices):
    """Fine-grained pipeline position shown on the processing timeline."""

    UPLOADING = "UPLOADING", "Uploading"
    STORED = "STORED", "Stored"
    QUEUED = "QUEUED", "Queued"
    PREPROCESSING = "PREPROCESSING", "Preprocessing"
    INFERENCE = "INFERENCE", "AI inference"
    ANALYZING = "ANALYZING", "Analyzing defects"
    COMPLETED = "COMPLETED", "Completed"
    FAILED = "FAILED", "Failed"


class InspectionType(models.TextChoices):
    ROUTINE = "ROUTINE", "Routine visual"
    DRONE = "DRONE", "Drone survey"
    FIXED_CAMERA = "FIXED_CAMERA", "Fixed camera"
    DETAILED = "DETAILED", "Detailed structural"
    POST_EVENT = "POST_EVENT", "Post-event (storm / seismic)"
    FOLLOW_UP = "FOLLOW_UP", "Follow-up"


class DefectType(models.TextChoices):
    CRACK = "CRACK", "Concrete crack"
    SPALLING = "SPALLING", "Spalling"
    CORROSION = "CORROSION", "Corrosion"
    RUST = "RUST", "Rust staining"
    EXPOSED_REBAR = "EXPOSED_REBAR", "Exposed rebar"
    EFFLORESCENCE = "EFFLORESCENCE", "Efflorescence"
    SURFACE_DAMAGE = "SURFACE_DAMAGE", "Surface damage"
    DEFORMATION = "DEFORMATION", "Deformation"
    OTHER = "OTHER", "Other"


class ReviewStatus(models.TextChoices):
    UNREVIEWED = "UNREVIEWED", "Unreviewed"
    CONFIRMED = "CONFIRMED", "Confirmed by engineer"
    REJECTED = "REJECTED", "Rejected (false positive)"


class InspectionLog(models.Model):
    reference = models.CharField(max_length=20, unique=True, editable=False)
    structural_asset = models.ForeignKey("assets.StructuralAsset", on_delete=models.CASCADE, related_name="inspections")
    inspection_date = models.DateTimeField(default=timezone.now, db_index=True)
    inspection_type = models.CharField(max_length=20, choices=InspectionType.choices, default=InspectionType.ROUTINE)
    notes = models.TextField(blank=True)

    status = models.CharField(max_length=12, choices=InspectionStatus.choices, default=InspectionStatus.PENDING, db_index=True)
    processing_stage = models.CharField(max_length=16, choices=ProcessingStage.choices, default=ProcessingStage.UPLOADING)
    health_status = models.CharField(max_length=10, choices=HealthStatus.choices, null=True, blank=True, db_index=True)
    overall_health_score = models.FloatField(null=True, blank=True, validators=[MinValueValidator(0), MaxValueValidator(100)])
    defect_count = models.PositiveIntegerField(default=0)
    max_severity = models.CharField(max_length=10, choices=Severity.choices, null=True, blank=True, db_index=True)

    processing_time = models.FloatField(null=True, blank=True, help_text="Total worker processing time in seconds.")
    model_version = models.CharField(max_length=120, blank=True)
    ml_model = models.ForeignKey("ml.MLModel", null=True, blank=True, on_delete=models.SET_NULL, related_name="inspections")
    inference_mode = models.CharField(max_length=12, choices=InferenceMode.choices, blank=True)
    preprocessing_report = models.JSONField(default=list, blank=True)
    summary = models.JSONField(default=dict, blank=True)

    inspector = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="inspections"
    )
    celery_task_id = models.CharField(max_length=64, blank=True, db_index=True)
    error_message = models.TextField(blank=True)
    attempts = models.PositiveSmallIntegerField(default=0)

    queued_at = models.DateTimeField(null=True, blank=True)
    started_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-inspection_date", "-id")
        indexes = [
            models.Index(fields=["structural_asset", "-inspection_date"]),
            models.Index(fields=["status", "-created_at"]),
        ]

    def __str__(self) -> str:
        return self.reference

    def save(self, *args, **kwargs):
        creating = self.pk is None
        if creating and not self.reference:
            self.reference = f"TMP-{uuid.uuid4().hex[:16]}"
        super().save(*args, **kwargs)
        if creating and self.reference.startswith("TMP-"):
            self.reference = f"INS-{1000 + self.pk}"
            super().save(update_fields=["reference"])

    @property
    def is_terminal(self) -> bool:
        return self.status in (InspectionStatus.COMPLETED, InspectionStatus.FAILED)


class ImageRecord(models.Model):
    inspection = models.ForeignKey(InspectionLog, on_delete=models.CASCADE, related_name="images")
    image_url = models.CharField(max_length=500, help_text="Canonical object location (s3:// or file://).")
    storage_key = models.CharField(max_length=300)
    thumbnail_key = models.CharField(max_length=300, blank=True)
    preview_key = models.CharField(max_length=300, blank=True)
    annotated_key = models.CharField(max_length=300, blank=True)
    original_filename = models.CharField(max_length=255)
    content_type = models.CharField(max_length=50)
    file_size = models.PositiveBigIntegerField()
    image_width = models.PositiveIntegerField()
    image_height = models.PositiveIntegerField()
    checksum = models.CharField(max_length=64, blank=True, help_text="SHA-256 of the uploaded bytes.")
    health_score = models.FloatField(null=True, blank=True)
    uploaded_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    uploaded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("uploaded_at", "id")

    def __str__(self) -> str:
        return self.original_filename


class DefectDetection(models.Model):
    inspection = models.ForeignKey(InspectionLog, on_delete=models.CASCADE, related_name="detections")
    image_record = models.ForeignKey(ImageRecord, on_delete=models.CASCADE, related_name="detections")
    defect_type = models.CharField(max_length=20, choices=DefectType.choices, db_index=True)
    severity = models.CharField(max_length=10, choices=Severity.choices, db_index=True)
    confidence_score = models.FloatField(validators=[MinValueValidator(0), MaxValueValidator(1)])
    x_min = models.PositiveIntegerField()
    y_min = models.PositiveIntegerField()
    x_max = models.PositiveIntegerField()
    y_max = models.PositiveIntegerField()
    area_ratio = models.FloatField(default=0, help_text="Bounding-box area relative to the image area.")
    description = models.TextField(blank=True)
    review_status = models.CharField(max_length=12, choices=ReviewStatus.choices, default=ReviewStatus.UNREVIEWED)
    reviewed_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    reviewed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-confidence_score",)
        indexes = [models.Index(fields=["defect_type", "severity"])]

    def __str__(self) -> str:
        return f"{self.get_defect_type_display()} ({self.get_severity_display()}, {self.confidence_score:.0%})"
