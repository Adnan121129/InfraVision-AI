"""End-to-end prediction orchestration.

    bytes -> PreprocessingService -> DefectModel.predict -> post-processing
          -> severity classification -> health score -> annotated image
"""

from __future__ import annotations

import logging
import time
from collections.abc import Callable

from ..config import MLSettings
from ..inference.annotate import annotate_image
from ..inference.health import health_score
from ..inference.postprocess import non_max_suppression, to_original_space
from ..inference.severity import SeverityClassifier
from ..taxonomy import DISPLAY_NAMES
from ..types import Detection, ModelInfo, PredictionResult, RawDetection, StageReport
from .model_service import ModelService
from .preprocessing_service import PreprocessingService

logger = logging.getLogger(__name__)

StageCallback = Callable[[str], None]


def describe(defect_type: str, severity: str, area_ratio: float, extent: float, is_demo: bool) -> str:
    name = DISPLAY_NAMES.get(defect_type, defect_type.title())
    if defect_type == "CRACK":
        size = f"spanning about {extent:.0%} of the frame"
    else:
        size = f"covering {area_ratio:.1%} of the frame"
    basis = "heuristic demo detector" if is_demo else "CNN model"
    return f"{name} {size}; rated {severity.lower()} from defect type, extent and {basis} confidence."


class PredictionService:
    def __init__(
        self,
        settings: MLSettings,
        model_service: ModelService,
        preprocessing: PreprocessingService,
        severity: SeverityClassifier | None = None,
    ):
        self.settings = settings
        self.model_service = model_service
        self.preprocessing = preprocessing
        self.severity = severity or SeverityClassifier()

    @property
    def model_info(self) -> ModelInfo:
        return self.model_service.info

    def aggregate_health(self, detections: list[Detection]) -> float:
        """Inspection-level health score across all images."""
        return health_score(detections)

    def _finalize(self, raw: list[RawDetection], scale: float, width: int, height: int, is_demo: bool) -> list[Detection]:
        detections: list[Detection] = []
        image_area = float(width * height)
        for det in non_max_suppression(raw):
            box = to_original_space(det, scale, width, height)
            if box.area == 0 or box.area / image_area < self.settings.min_box_area_ratio:
                continue
            severity, severity_score = self.severity.classify(det.defect_type, det.score, box.width, box.height, width, height)
            extent = self.severity.extent(det.defect_type, box.width, box.height, width, height) * 0.6
            area_ratio = box.area / image_area
            detections.append(
                Detection(
                    defect_type=det.defect_type,
                    confidence=round(det.score, 4),
                    bbox=box,
                    severity=severity,
                    severity_score=severity_score,
                    area_ratio=area_ratio,
                    description=describe(det.defect_type, severity, area_ratio, extent, is_demo),
                )
            )
        detections.sort(key=lambda d: (d.severity_score, d.confidence), reverse=True)
        return detections[: self.settings.max_detections]

    def predict(self, image_bytes: bytes, on_stage: StageCallback | None = None) -> PredictionResult:
        emit = on_stage or (lambda _stage: None)
        model = self.model_service.model
        info = model.info
        started = time.perf_counter()

        emit("preprocessing")
        ctx = self.preprocessing.run(image_bytes, model.input_spec)
        preprocessing_ms = (time.perf_counter() - started) * 1000

        emit("inference")
        t0 = time.perf_counter()
        raw = model.predict(ctx)
        inference_ms = (time.perf_counter() - t0) * 1000
        reports = list(ctx.reports)
        reports.append(
            StageReport(
                "model_inference",
                model.inference_label,
                "completed",
                inference_ms,
                {"model": f"{info.name} {info.version}", "raw_detections": len(raw), **({"tiles": ctx.metadata["tiles_evaluated"]} if "tiles_evaluated" in ctx.metadata else {})},
            )
        )

        emit("postprocessing")
        t1 = time.perf_counter()
        width, height = ctx.original_size
        detections = self._finalize(raw, ctx.scale, width, height, info.is_demo)
        score = health_score(detections)
        annotated = annotate_image(ctx.original, detections, self.settings.annotate_max_side) if self.settings.annotate else None
        postprocessing_ms = (time.perf_counter() - t1) * 1000
        reports.append(
            StageReport(
                "postprocessing",
                "Defect analysis & severity scoring",
                "completed",
                postprocessing_ms,
                {"detections": len(detections), "method": "class-aware NMS + rule-based severity"},
            )
        )

        return PredictionResult(
            detections=detections,
            health_score=score,
            image_width=width,
            image_height=height,
            model=info,
            inference_mode="demo" if info.is_demo else "production",
            preprocessing=reports,
            timings={
                "preprocessing_ms": preprocessing_ms,
                "inference_ms": inference_ms,
                "postprocessing_ms": postprocessing_ms,
                "total_ms": (time.perf_counter() - started) * 1000,
            },
            annotated_image=annotated,
        )


def build_prediction_service(settings: MLSettings | None = None) -> PredictionService:
    settings = settings or MLSettings.from_env()
    model_service = ModelService(settings)
    model_service.warmup()
    return PredictionService(settings, model_service, PreprocessingService.from_settings(settings))
