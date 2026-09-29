from __future__ import annotations

from django.db import models


class Framework(models.TextChoices):
    PYTORCH = "PYTORCH", "PyTorch"
    TENSORFLOW = "TENSORFLOW", "TensorFlow"
    ONNX = "ONNX", "ONNX Runtime"
    OPENCV = "OPENCV", "OpenCV (classical CV)"


class ModelStatus(models.TextChoices):
    ACTIVE = "ACTIVE", "Active"
    STAGING = "STAGING", "Staging"
    INACTIVE = "INACTIVE", "Inactive"
    RETIRED = "RETIRED", "Retired"


class MLModel(models.Model):
    """Registry of inference models.

    Rows are upserted by the ML worker when it loads a model, so the registry
    always reflects what is actually serving predictions. ``is_demo`` marks the
    heuristic demo detector, which is *not* a trained neural network.
    """

    model_name = models.CharField(max_length=120)
    version = models.CharField(max_length=60)
    framework = models.CharField(max_length=20, choices=Framework.choices)
    architecture = models.CharField(max_length=120, blank=True)
    task = models.CharField(max_length=80, default="Structural defect detection")
    description = models.TextField(blank=True)
    is_demo = models.BooleanField(default=False, help_text="Demo/mock inference - not a trained model.")

    accuracy = models.FloatField(null=True, blank=True, help_text="Validation accuracy (0-1) from the model card.")
    precision = models.FloatField(null=True, blank=True)
    recall = models.FloatField(null=True, blank=True)
    f1_score = models.FloatField(null=True, blank=True)
    training_dataset = models.CharField(max_length=160, blank=True)
    classes = models.JSONField(default=list, blank=True)
    input_size = models.PositiveIntegerField(null=True, blank=True)
    artifact_uri = models.CharField(max_length=300, blank=True)

    status = models.CharField(max_length=10, choices=ModelStatus.choices, default=ModelStatus.STAGING, db_index=True)
    deployed_at = models.DateTimeField(null=True, blank=True)
    last_heartbeat_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-last_heartbeat_at", "-created_at")
        constraints = [models.UniqueConstraint(fields=("model_name", "version"), name="unique_model_version")]
        verbose_name = "ML model"

    def __str__(self) -> str:
        return f"{self.model_name} {self.version}"
