"""Celery tasks for the inspection pipeline.

``run_inference`` is routed to the ``inference`` queue and executed by the
dedicated ML worker container; everything else runs on the default worker.
"""

from __future__ import annotations

import io
import logging
import time
from datetime import timedelta

from celery import shared_task
from celery.exceptions import SoftTimeLimitExceeded
from django.conf import settings
from django.utils import timezone
from PIL import Image, ImageOps

from apps.core.exceptions import StorageUnavailable
from apps.core.storage import object_storage

from .models import ImageRecord, InspectionLog, InspectionStatus, ProcessingStage
from .services import (
    ImageOutcome,
    InferenceOutcome,
    apply_inference_outcome,
    begin_processing,
    mark_failed,
    mark_stage,
)

logger = logging.getLogger(__name__)

# Pipeline stage names emitted by infravision_ml -> timeline stages.
ML_STAGE_MAP = {
    "preprocessing": ProcessingStage.PREPROCESSING,
    "inference": ProcessingStage.INFERENCE,
    "postprocessing": ProcessingStage.ANALYZING,
}


@shared_task(
    name="inspections.generate_image_derivatives",
    autoretry_for=(StorageUnavailable,),
    retry_backoff=True,
    max_retries=3,
)
def generate_image_derivatives(image_id: int) -> dict:
    """Create a thumbnail and a browser-sized preview so originals never ship to the dashboard."""
    try:
        image = ImageRecord.objects.get(pk=image_id)
    except ImageRecord.DoesNotExist:
        return {"skipped": True}

    Image.MAX_IMAGE_PIXELS = settings.MAX_IMAGE_PIXELS
    original = object_storage.read(image.storage_key)
    base_key = image.storage_key.rsplit(".", 1)[0]
    updates = {}
    with Image.open(io.BytesIO(original)) as source:
        source = ImageOps.exif_transpose(source).convert("RGB")
        for field_name, suffix, size, quality in (
            ("preview_key", "preview", settings.IMAGE_PREVIEW_SIZE, 85),
            ("thumbnail_key", "thumb", settings.IMAGE_THUMBNAIL_SIZE, 78),
        ):
            variant = source.copy()
            variant.thumbnail((size, size), Image.Resampling.LANCZOS)
            buffer = io.BytesIO()
            variant.save(buffer, format="JPEG", quality=quality, optimize=True, progressive=True)
            updates[field_name] = object_storage.save(f"{base_key}_{suffix}.jpg", buffer.getvalue(), "image/jpeg")

    ImageRecord.objects.filter(pk=image_id).update(**updates)
    return updates


def _store_annotated(image: ImageRecord, annotated: bytes | None) -> str:
    if not annotated:
        return ""
    base_key = image.storage_key.rsplit(".", 1)[0]
    return object_storage.save(f"{base_key}_annotated.jpg", annotated, "image/jpeg")


@shared_task(
    bind=True,
    name="inspections.run_inference",
    acks_late=True,
    soft_time_limit=settings.INFERENCE_SOFT_TIME_LIMIT,
    time_limit=settings.INFERENCE_SOFT_TIME_LIMIT + 60,
    max_retries=settings.INFERENCE_MAX_RETRIES,
)
def run_inference(self, inspection_id: int) -> dict:
    """Run the computer-vision pipeline on every image of an inspection and persist predictions."""
    from apps.ml.services import get_prediction_service, register_serving_model

    try:
        inspection = InspectionLog.objects.select_related("structural_asset").get(pk=inspection_id)
    except InspectionLog.DoesNotExist:
        logger.warning("Inspection %s no longer exists; dropping task", inspection_id)
        return {"skipped": "missing"}

    if inspection.status == InspectionStatus.COMPLETED:
        return {"skipped": "already-completed"}
    if inspection.celery_task_id and self.request.id and inspection.celery_task_id != self.request.id:
        logger.info("Ignoring superseded task %s for %s", self.request.id, inspection.reference)
        return {"skipped": "superseded"}

    inspection = begin_processing(inspection_id)
    started = time.perf_counter()
    try:
        service = get_prediction_service()
        model_record = register_serving_model(service.model_info)
        images = list(inspection.images.all())
        outcomes: list[ImageOutcome] = []
        all_detections = []

        for index, image in enumerate(images, start=1):
            detail = f"image {index} of {len(images)}"
            mark_stage(inspection, ProcessingStage.PREPROCESSING, detail)
            data = object_storage.read(image.storage_key)

            def on_stage(stage_name: str, _detail=detail) -> None:
                stage = ML_STAGE_MAP.get(stage_name)
                if stage:
                    mark_stage(inspection, stage, _detail)

            result = service.predict(data, on_stage=on_stage)
            payload = result.to_dict()
            all_detections.extend(result.detections)
            outcomes.append(
                ImageOutcome(
                    image_id=image.pk,
                    width=payload["image_width"],
                    height=payload["image_height"],
                    health_score=payload["health_score"],
                    detections=payload["detections"],
                    preprocessing=payload["preprocessing"],
                    timings=payload["timings"],
                    annotated_key=_store_annotated(image, result.annotated_image),
                )
            )

        mark_stage(inspection, ProcessingStage.ANALYZING)
        info = service.model_info
        outcome = InferenceOutcome(
            images=outcomes,
            overall_health_score=service.aggregate_health(all_detections),
            processing_time=time.perf_counter() - started,
            model_version=f"{info.name} {info.version}",
            inference_mode="demo" if info.is_demo else "production",
            ml_model_id=model_record.pk,
        )
        inspection = apply_inference_outcome(inspection_id, outcome)
        return {"reference": inspection.reference, "defects": inspection.defect_count, "health": inspection.overall_health_score}

    except StorageUnavailable as exc:
        if self.request.retries < self.max_retries:
            countdown = 15 * (2**self.request.retries)
            logger.warning("Storage unavailable for %s; retrying in %ss", inspection.reference, countdown)
            InspectionLog.objects.filter(pk=inspection_id).update(
                status=InspectionStatus.QUEUED, processing_stage=ProcessingStage.QUEUED, updated_at=timezone.now()
            )
            raise self.retry(exc=exc, countdown=countdown)
        mark_failed(inspection_id, "Image storage was unavailable after several retries.")
    except FileNotFoundError:
        mark_failed(inspection_id, "A source image is missing from object storage. Re-upload the imagery and retry.")
    except SoftTimeLimitExceeded:
        mark_failed(inspection_id, "AI processing exceeded the time limit. Try fewer or smaller images.")
    except Exception as exc:  # noqa: BLE001 - any failure must be reported, never left "processing"
        logger.exception("Inference failed for inspection %s", inspection_id)
        user_message = getattr(exc, "user_message", None)
        mark_failed(inspection_id, user_message or f"AI inference failed ({exc.__class__.__name__}). The error has been logged.")
    return {"reference": inspection.reference, "failed": True}


@shared_task(name="inspections.recover_stalled_inspections")
def recover_stalled_inspections() -> int:
    """Fail inspections whose worker disappeared so users can retry them."""
    cutoff = timezone.now() - timedelta(minutes=settings.INFERENCE_STALL_MINUTES)
    stalled = list(
        InspectionLog.objects.filter(
            status__in=[InspectionStatus.QUEUED, InspectionStatus.PROCESSING], updated_at__lt=cutoff
        ).values_list("pk", flat=True)
    )
    for pk in stalled:
        mark_failed(pk, "Processing stalled because no ML worker picked it up in time. Retry the inspection.")
    if stalled:
        logger.warning("Recovered %s stalled inspection(s)", len(stalled))
    return len(stalled)
