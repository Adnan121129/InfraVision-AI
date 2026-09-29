"""Environment-driven configuration for the ML worker."""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

DEFAULT_STAGES = (
    "image_loading",
    "resolution_normalization",
    "noise_reduction",
    "color_normalization",
    "lighting_correction",
    "contrast_enhancement",
    "edge_enhancement",
    "resizing",
    "tensor_conversion",
)


def _bool(name: str, default: bool) -> bool:
    value = os.environ.get(name)
    if value is None or value == "":
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


@dataclass(frozen=True)
class MLSettings:
    # "demo" = heuristic OpenCV detector (clearly flagged as demo output)
    # "pytorch" = trained PyTorch checkpoint described by a model card
    inference_mode: str = "demo"
    model_dir: Path = Path("/models")
    model_path: Path | None = None
    model_card_path: Path | None = None
    device: str = "auto"
    batch_size: int = 32
    detection_threshold: float = 0.55
    min_box_area_ratio: float = 0.0004
    working_max_side: int = 2048
    tile_stride_ratio: float = 0.5
    max_detections: int = 40
    preprocessing_stages: tuple[str, ...] = DEFAULT_STAGES
    annotate: bool = True
    annotate_max_side: int = 1600
    allow_demo_fallback: bool = False
    extra: dict = field(default_factory=dict)

    @classmethod
    def from_env(cls) -> "MLSettings":
        model_dir = Path(os.environ.get("MODEL_DIR", "/models"))
        model_path = os.environ.get("MODEL_PATH")
        card_path = os.environ.get("MODEL_CARD_PATH")
        stages = os.environ.get("PREPROCESSING_STAGES")
        return cls(
            inference_mode=os.environ.get("INFERENCE_MODE", "demo").strip().lower(),
            model_dir=model_dir,
            model_path=Path(model_path) if model_path else model_dir / "model.pt",
            model_card_path=Path(card_path) if card_path else None,
            device=os.environ.get("MODEL_DEVICE", "auto"),
            batch_size=int(os.environ.get("MODEL_BATCH_SIZE", "32")),
            detection_threshold=float(os.environ.get("DETECTION_THRESHOLD", "0.55")),
            min_box_area_ratio=float(os.environ.get("MIN_BOX_AREA_RATIO", "0.0004")),
            working_max_side=int(os.environ.get("WORKING_MAX_SIDE", "2048")),
            tile_stride_ratio=float(os.environ.get("TILE_STRIDE_RATIO", "0.5")),
            max_detections=int(os.environ.get("MAX_DETECTIONS", "40")),
            preprocessing_stages=tuple(s.strip() for s in stages.split(",") if s.strip()) if stages else DEFAULT_STAGES,
            annotate=_bool("ANNOTATE_IMAGES", True),
            annotate_max_side=int(os.environ.get("ANNOTATE_MAX_SIDE", "1600")),
            allow_demo_fallback=_bool("INFERENCE_ALLOW_DEMO_FALLBACK", False),
        )
