"""Bridge between Django and the framework-agnostic ``infravision_ml`` package.

Only the ML worker imports ``infravision_ml`` (it carries OpenCV/PyTorch). The
API and default Celery worker never load it, which keeps them lightweight and
means swapping the model never touches Django code.
"""

from __future__ import annotations

import logging
import threading

from django.db import transaction
from django.utils import timezone

from .models import Framework, MLModel, ModelStatus

logger = logging.getLogger(__name__)

_service = None
_lock = threading.Lock()

_FRAMEWORK_MAP = {
    "pytorch": Framework.PYTORCH,
    "tensorflow": Framework.TENSORFLOW,
    "onnx": Framework.ONNX,
    "opencv": Framework.OPENCV,
}


def get_prediction_service():
    """Process-wide PredictionService; the model is loaded once per worker process."""
    global _service
    if _service is None:
        with _lock:
            if _service is None:
                from infravision_ml.services import build_prediction_service

                _service = build_prediction_service()
                logger.info("Prediction service ready: %s", _service.model_info)
    return _service


def reset_prediction_service() -> None:
    global _service
    _service = None


@transaction.atomic
def register_serving_model(info) -> MLModel:
    """Upsert the registry row for the model the worker is serving and mark it active."""
    metrics = info.metrics or {}
    model, created = MLModel.objects.select_for_update().get_or_create(
        model_name=info.name,
        version=info.version,
        defaults={"framework": _FRAMEWORK_MAP.get(info.framework, Framework.PYTORCH)},
    )
    model.framework = _FRAMEWORK_MAP.get(info.framework, Framework.PYTORCH)
    model.architecture = info.architecture
    model.description = info.description or model.description
    model.is_demo = info.is_demo
    model.classes = list(info.classes)
    model.input_size = info.input_size
    model.artifact_uri = info.artifact_uri or ""
    model.training_dataset = info.training_dataset or ""
    model.accuracy = metrics.get("accuracy")
    model.precision = metrics.get("precision")
    model.recall = metrics.get("recall")
    model.f1_score = metrics.get("f1")
    if model.status != ModelStatus.ACTIVE:
        model.deployed_at = timezone.now()
    model.status = ModelStatus.ACTIVE
    model.last_heartbeat_at = timezone.now()
    model.save()
    MLModel.objects.filter(status=ModelStatus.ACTIVE).exclude(pk=model.pk).update(status=ModelStatus.INACTIVE)
    if created:
        logger.info("Registered new model %s", model)
    return model
