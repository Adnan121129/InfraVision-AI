"""Plain data structures exchanged between pipeline components.

Nothing here depends on a deep-learning framework, which keeps the Django
integration independent of PyTorch/TensorFlow.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True)
class BoundingBox:
    x_min: int
    y_min: int
    x_max: int
    y_max: int

    @property
    def width(self) -> int:
        return max(0, self.x_max - self.x_min)

    @property
    def height(self) -> int:
        return max(0, self.y_max - self.y_min)

    @property
    def area(self) -> int:
        return self.width * self.height

    def scaled(self, factor: float) -> "BoundingBox":
        return BoundingBox(
            int(round(self.x_min * factor)),
            int(round(self.y_min * factor)),
            int(round(self.x_max * factor)),
            int(round(self.y_max * factor)),
        )

    def clipped(self, width: int, height: int) -> "BoundingBox":
        return BoundingBox(
            min(max(0, self.x_min), width),
            min(max(0, self.y_min), height),
            min(max(0, self.x_max), width),
            min(max(0, self.y_max), height),
        )

    def union(self, other: "BoundingBox") -> "BoundingBox":
        return BoundingBox(
            min(self.x_min, other.x_min),
            min(self.y_min, other.y_min),
            max(self.x_max, other.x_max),
            max(self.y_max, other.y_max),
        )

    def iou(self, other: "BoundingBox") -> float:
        ix = max(0, min(self.x_max, other.x_max) - max(self.x_min, other.x_min))
        iy = max(0, min(self.y_max, other.y_max) - max(self.y_min, other.y_min))
        inter = ix * iy
        union = self.area + other.area - inter
        return inter / union if union else 0.0

    def overlap_of_smaller(self, other: "BoundingBox") -> float:
        ix = max(0, min(self.x_max, other.x_max) - max(self.x_min, other.x_min))
        iy = max(0, min(self.y_max, other.y_max) - max(self.y_min, other.y_min))
        smaller = min(self.area, other.area)
        return (ix * iy) / smaller if smaller else 0.0

    def to_dict(self) -> dict[str, int]:
        return {"x_min": self.x_min, "y_min": self.y_min, "x_max": self.x_max, "y_max": self.y_max}


@dataclass
class RawDetection:
    """Model output in *working image* coordinates, before severity/health scoring."""

    defect_type: str
    score: float
    box: BoundingBox
    extras: dict[str, Any] = field(default_factory=dict)


@dataclass
class Detection:
    defect_type: str
    confidence: float
    bbox: BoundingBox
    severity: str
    area_ratio: float
    description: str
    severity_score: float = 0.0

    def to_dict(self) -> dict[str, Any]:
        return {
            "defect_type": self.defect_type,
            "confidence": round(float(self.confidence), 4),
            "bbox": self.bbox.to_dict(),
            "severity": self.severity,
            "severity_score": round(float(self.severity_score), 4),
            "area_ratio": round(float(self.area_ratio), 5),
            "description": self.description,
        }


@dataclass
class StageReport:
    name: str
    label: str
    status: str  # completed | skipped | failed
    duration_ms: float
    details: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "label": self.label,
            "status": self.status,
            "duration_ms": round(self.duration_ms, 2),
            "details": self.details,
        }


@dataclass(frozen=True)
class ModelInfo:
    name: str
    version: str
    framework: str  # pytorch | tensorflow | onnx | opencv
    architecture: str
    is_demo: bool
    description: str = ""
    classes: tuple[str, ...] = ()
    input_size: int | None = None
    artifact_uri: str = ""
    training_dataset: str = ""
    metrics: dict[str, float] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "version": self.version,
            "framework": self.framework,
            "architecture": self.architecture,
            "is_demo": self.is_demo,
            "description": self.description,
            "classes": list(self.classes),
            "input_size": self.input_size,
            "artifact_uri": self.artifact_uri,
            "training_dataset": self.training_dataset,
            "metrics": dict(self.metrics),
        }


@dataclass(frozen=True)
class InputSpec:
    """How a model wants its input prepared by the preprocessing pipeline.

    ``mode``:
      * ``"tiled"``   - sliding-window patches of ``size`` px (patch classifiers, e.g. SDNET2018)
      * ``"whole"``   - the whole image resized to ``size`` x ``size`` (detectors / global classifiers)
      * ``"image"``   - no tensor; the model consumes the enhanced BGR image (classical CV)
    """

    mode: str = "image"
    size: int = 224
    stride: int | None = None
    mean: tuple[float, float, float] = (0.485, 0.456, 0.406)
    std: tuple[float, float, float] = (0.229, 0.224, 0.225)


@dataclass
class PredictionResult:
    detections: list[Detection]
    health_score: float
    image_width: int
    image_height: int
    model: ModelInfo
    inference_mode: str  # "demo" | "production"
    preprocessing: list[StageReport]
    timings: dict[str, float]
    annotated_image: bytes | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "detections": [d.to_dict() for d in self.detections],
            "health_score": round(float(self.health_score), 2),
            "image_width": self.image_width,
            "image_height": self.image_height,
            "model": self.model.to_dict(),
            "inference_mode": self.inference_mode,
            "preprocessing": [s.to_dict() for s in self.preprocessing],
            "timings": {k: round(v, 2) for k, v in self.timings.items()},
        }
