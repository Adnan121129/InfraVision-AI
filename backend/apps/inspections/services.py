"""Inspection workflow services.

Lifecycle::

    create_inspection()        PENDING / UPLOADING
    add_image() x N            PENDING / STORED          (images persisted to S3/MinIO)
    submit_inspection()        QUEUED  / QUEUED          (Celery task published to Redis)
    [ml-worker] begin_processing()     PROCESSING / PREPROCESSING -> INFERENCE -> ANALYZING
    [ml-worker] apply_inference_outcome()  COMPLETED / COMPLETED  (predictions written to PostgreSQL)
                mark_failed()               FAILED / FAILED

Heavy ML work never happens inside an HTTP request.
"""

from __future__ import annotations

import logging
import uuid
from collections import Counter
from dataclasses import dataclass, field

from django.conf import settings
from django.core.cache import cache
from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.alerts.services import create_alerts_for_inspection
from apps.assets.services import refresh_asset_health
from apps.core.choices import Severity
from apps.core.exceptions import InvalidStateTransition, ServiceUnavailable
from apps.core.models import PlatformConfiguration
from apps.core.storage import object_storage

from .models import DefectDetection, ImageRecord, InspectionLog, InspectionStatus, ProcessingStage
from .realtime import broadcast_inspection_update
from .validators import validate_inspection_image

logger = logging.getLogger(__name__)

DASHBOARD_CACHE_KEY = "dashboard:v1"
STAGE_MESSAGES = {
    ProcessingStage.QUEUED: "is queued for AI processing",
    ProcessingStage.PREPROCESSING: "is being preprocessed",
    ProcessingStage.INFERENCE: "is running AI inference",
    ProcessingStage.ANALYZING: "is analysing detected defects",
}
CONFIDENCE_BINS = [(0.0, 0.5), (0.5, 0.6), (0.6, 0.7), (0.7, 0.8), (0.8, 0.9), (0.9, 1.0001)]


def invalidate_dashboard_cache() -> None:
    try:
        cache.delete(DASHBOARD_CACHE_KEY)
    except Exception:
        logger.warning("Could not invalidate dashboard cache", exc_info=True)


# ---------------------------------------------------------------------------
# Creation & uploads
# ---------------------------------------------------------------------------
def create_inspection(*, asset, user, inspection_type, notes="", inspection_date=None) -> InspectionLog:
    if asset.is_archived:
        raise ValidationError({"structural_asset": "Archived assets cannot be inspected. Restore the asset first."})
    return InspectionLog.objects.create(
        structural_asset=asset,
        inspector=user,
        inspection_type=inspection_type,
        notes=notes,
        inspection_date=inspection_date or timezone.now(),
    )


def _storage_key(inspection: InspectionLog, extension: str) -> str:
    now = timezone.now()
    return f"inspections/{now:%Y/%m}/{inspection.reference}/{uuid.uuid4().hex}.{extension}"


def add_image(inspection: InspectionLog, uploaded_file, user) -> ImageRecord:
    if inspection.status not in (InspectionStatus.PENDING, InspectionStatus.FAILED):
        raise InvalidStateTransition("Images can only be added before the inspection is submitted for processing.")
    if inspection.images.count() >= settings.MAX_IMAGES_PER_INSPECTION:
        raise ValidationError({"file": f"An inspection can contain at most {settings.MAX_IMAGES_PER_INSPECTION} images."})

    image = validate_inspection_image(uploaded_file)
    key = object_storage.save(_storage_key(inspection, image.extension), image.content, image.content_type)
    record = ImageRecord.objects.create(
        inspection=inspection,
        image_url=object_storage.uri(key),
        storage_key=key,
        original_filename=(getattr(uploaded_file, "name", "") or f"image.{image.extension}")[:255],
        content_type=image.content_type,
        file_size=len(image.content),
        image_width=image.width,
        image_height=image.height,
        checksum=image.checksum,
        uploaded_by=user,
    )
    if inspection.processing_stage == ProcessingStage.UPLOADING:
        InspectionLog.objects.filter(pk=inspection.pk).update(processing_stage=ProcessingStage.STORED, updated_at=timezone.now())

    from .tasks import generate_image_derivatives

    transaction.on_commit(lambda: _safe_delay(generate_image_derivatives, record.pk))
    return record


def _safe_delay(task, *args) -> None:
    try:
        task.delay(*args)
    except Exception:
        logger.warning("Could not enqueue %s%s; continuing without it", task.name, args, exc_info=True)


def remove_image(image: ImageRecord) -> None:
    if image.inspection.status not in (InspectionStatus.PENDING, InspectionStatus.FAILED):
        raise InvalidStateTransition("Images cannot be removed after the inspection has been submitted.")
    image.delete()


# ---------------------------------------------------------------------------
# Queueing
# ---------------------------------------------------------------------------
def submit_inspection(inspection: InspectionLog, *, allow_statuses=(InspectionStatus.PENDING, InspectionStatus.FAILED)) -> InspectionLog:
    from .tasks import run_inference

    with transaction.atomic():
        locked = InspectionLog.objects.select_for_update().get(pk=inspection.pk)
        if locked.status not in allow_statuses:
            raise InvalidStateTransition(f"Inspection is {locked.get_status_display().lower()} and cannot be submitted.")
        if not locked.images.exists():
            raise ValidationError({"images": "Upload at least one image before running the AI inspection."})

        task_id = str(uuid.uuid4())
        locked.status = InspectionStatus.QUEUED
        locked.processing_stage = ProcessingStage.QUEUED
        locked.celery_task_id = task_id
        locked.queued_at = timezone.now()
        locked.started_at = None
        locked.completed_at = None
        locked.error_message = ""
        locked.save()

    try:
        run_inference.apply_async(args=[locked.pk], task_id=task_id)
    except Exception as exc:
        logger.exception("Failed to publish inference task for %s", locked.reference)
        mark_failed(locked.pk, "The processing queue is unavailable. Please retry in a few minutes.")
        raise ServiceUnavailable("The AI processing queue is unavailable. The inspection was saved; retry shortly.") from exc

    broadcast_inspection_update(locked, f"Inspection {locked.reference} is queued for AI processing.", kind="queued")
    invalidate_dashboard_cache()
    return locked


# ---------------------------------------------------------------------------
# Worker-side state transitions
# ---------------------------------------------------------------------------
def begin_processing(inspection_id: int) -> InspectionLog:
    inspection = InspectionLog.objects.select_related("structural_asset").get(pk=inspection_id)
    inspection.status = InspectionStatus.PROCESSING
    inspection.processing_stage = ProcessingStage.PREPROCESSING
    inspection.started_at = timezone.now()
    inspection.attempts += 1
    inspection.save(update_fields=["status", "processing_stage", "started_at", "attempts", "updated_at"])
    broadcast_inspection_update(inspection, f"Inspection {inspection.reference} is now processing…", kind="started")
    return inspection


def mark_stage(inspection: InspectionLog, stage: str, detail: str | None = None) -> None:
    if inspection.processing_stage == stage:
        return
    inspection.processing_stage = stage
    inspection.save(update_fields=["processing_stage", "updated_at"])
    message = f"Inspection {inspection.reference} {STAGE_MESSAGES.get(stage, 'updated')}"
    broadcast_inspection_update(inspection, f"{message} ({detail})." if detail else f"{message}.")


def mark_failed(inspection_id: int, message: str) -> None:
    InspectionLog.objects.filter(pk=inspection_id).update(
        status=InspectionStatus.FAILED,
        processing_stage=ProcessingStage.FAILED,
        error_message=message[:2000],
        completed_at=timezone.now(),
        updated_at=timezone.now(),
    )
    inspection = InspectionLog.objects.select_related("structural_asset").get(pk=inspection_id)
    broadcast_inspection_update(inspection, f"Inspection {inspection.reference} failed: {message}", level="error", kind="failed")
    invalidate_dashboard_cache()


# ---------------------------------------------------------------------------
# Persisting predictions
# ---------------------------------------------------------------------------
@dataclass
class ImageOutcome:
    image_id: int
    width: int
    height: int
    health_score: float
    detections: list[dict]
    preprocessing: list[dict] = field(default_factory=list)
    timings: dict = field(default_factory=dict)
    annotated_key: str = ""


@dataclass
class InferenceOutcome:
    images: list[ImageOutcome]
    overall_health_score: float
    processing_time: float
    model_version: str
    inference_mode: str
    ml_model_id: int | None = None


def _merge_preprocessing(images: list[ImageOutcome]) -> list[dict]:
    """Collapse per-image stage reports into one report with summed durations."""
    merged: dict[str, dict] = {}
    for outcome in images:
        for stage in outcome.preprocessing:
            entry = merged.setdefault(
                stage["name"],
                {"name": stage["name"], "label": stage.get("label", stage["name"]), "status": stage["status"], "duration_ms": 0.0, "details": stage.get("details", {})},
            )
            entry["duration_ms"] = round(entry["duration_ms"] + float(stage.get("duration_ms", 0)), 2)
            if stage["status"] == "failed":
                entry["status"] = "failed"
    return list(merged.values())


def build_summary(detections: list[DefectDetection], images: list[ImageOutcome]) -> dict:
    severity_counts = Counter(d.severity for d in detections)
    type_counts = Counter(d.defect_type for d in detections)
    confidences = [d.confidence_score for d in detections]
    timings: Counter = Counter()
    for outcome in images:
        timings.update({k: v for k, v in outcome.timings.items() if isinstance(v, (int, float))})
    return {
        "severity_counts": {s: severity_counts.get(s, 0) for s in Severity.values},
        "type_counts": dict(type_counts),
        "images_processed": len(images),
        "avg_confidence": round(sum(confidences) / len(confidences), 4) if confidences else None,
        "timings_ms": {k: round(v, 1) for k, v in timings.items()},
    }


def confidence_distribution(confidences: list[float]) -> list[dict]:
    rows = []
    for low, high in CONFIDENCE_BINS:
        label = f"{int(low * 100)}–{min(int(high * 100), 100)}%"
        rows.append({"range": label, "count": sum(1 for c in confidences if low <= c < high)})
    return rows


def apply_inference_outcome(inspection_id: int, outcome: InferenceOutcome) -> InspectionLog:
    config = PlatformConfiguration.load()
    with transaction.atomic():
        inspection = InspectionLog.objects.select_for_update().select_related("structural_asset").get(pk=inspection_id)
        asset = inspection.structural_asset
        previous_score = asset.current_health_score

        inspection.detections.all().delete()
        images = {img.pk: img for img in inspection.images.all()}
        new_detections: list[DefectDetection] = []
        for image_outcome in outcome.images:
            image = images.get(image_outcome.image_id)
            if image is None:
                continue
            image.health_score = round(image_outcome.health_score, 1)
            image.image_width = image_outcome.width or image.image_width
            image.image_height = image_outcome.height or image.image_height
            if image_outcome.annotated_key:
                image.annotated_key = image_outcome.annotated_key
            image.save(update_fields=["health_score", "image_width", "image_height", "annotated_key"])
            for det in image_outcome.detections:
                bbox = det["bbox"]
                new_detections.append(
                    DefectDetection(
                        inspection=inspection,
                        image_record=image,
                        defect_type=det["defect_type"],
                        severity=det["severity"],
                        confidence_score=round(float(det["confidence"]), 4),
                        x_min=int(bbox["x_min"]),
                        y_min=int(bbox["y_min"]),
                        x_max=int(bbox["x_max"]),
                        y_max=int(bbox["y_max"]),
                        area_ratio=round(float(det.get("area_ratio", 0.0)), 5),
                        description=det.get("description", ""),
                    )
                )
        DefectDetection.objects.bulk_create(new_detections)

        score = round(outcome.overall_health_score, 1)
        inspection.status = InspectionStatus.COMPLETED
        inspection.processing_stage = ProcessingStage.COMPLETED
        inspection.overall_health_score = score
        inspection.health_status = config.health_status_for(score)
        inspection.defect_count = len(new_detections)
        inspection.max_severity = Severity.max(d.severity for d in new_detections)
        inspection.processing_time = round(outcome.processing_time, 3)
        inspection.model_version = outcome.model_version
        inspection.ml_model_id = outcome.ml_model_id
        inspection.inference_mode = outcome.inference_mode
        inspection.preprocessing_report = _merge_preprocessing(outcome.images)
        inspection.summary = build_summary(new_detections, outcome.images)
        inspection.completed_at = timezone.now()
        inspection.error_message = ""
        inspection.save()

        create_alerts_for_inspection(inspection, previous_score)
        refresh_asset_health(asset)

    count = inspection.defect_count
    noun = "structural anomaly" if count == 1 else "structural anomalies"
    broadcast_inspection_update(
        inspection,
        f"Inspection {inspection.reference} completed — {count} {noun} detected.",
        level="warning" if inspection.max_severity in (Severity.HIGH, Severity.CRITICAL) else "success",
        kind="completed",
    )
    invalidate_dashboard_cache()
    return inspection
