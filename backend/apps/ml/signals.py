"""Warm the model when an ML worker starts so the registry shows what is serving."""

from __future__ import annotations

import logging
import os

from celery.signals import worker_ready

logger = logging.getLogger(__name__)


@worker_ready.connect
def warm_inference_model(sender=None, **kwargs):
    if os.environ.get("ML_WORKER_ROLE") != "inference":
        return
    from .services import get_prediction_service, register_serving_model

    try:
        service = get_prediction_service()
        model = register_serving_model(service.model_info)
        logger.info("ML worker serving %s (demo=%s)", model, model.is_demo)
    except Exception:
        # The worker keeps running; inspections will fail with a clear message instead.
        logger.exception("Failed to load the inference model at worker start-up")
