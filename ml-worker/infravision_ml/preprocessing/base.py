"""Composable preprocessing pipeline.

Each stage is a small class registered under a name. The pipeline is built
from an ordered list of names (``PREPROCESSING_STAGES``), so techniques can be
added, removed or reordered without code changes elsewhere::

    @register_stage
    class Dehaze(PreprocessingStage):
        name = "dehaze"
        label = "Dehazing"

        def apply(self, ctx):
            ctx.image = my_dehaze(ctx.image)
            return {"method": "dark-channel-prior"}
"""

from __future__ import annotations

import time
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, ClassVar

import numpy as np

from ..exceptions import ConfigurationError
from ..types import InputSpec, StageReport


@dataclass
class PreprocessingContext:
    raw_bytes: bytes
    input_spec: InputSpec
    original: np.ndarray | None = None  # decoded full-resolution BGR image
    base: np.ndarray | None = None  # resolution-normalised image before enhancement (colour reference)
    image: np.ndarray | None = None  # working image, progressively enhanced
    scale: float = 1.0  # working / original
    tensor: np.ndarray | None = None  # float32 NCHW batch for neural models
    tiles: list[tuple[int, int, int, int]] = field(default_factory=list)  # working-coordinate tile boxes
    grid_shape: tuple[int, int] | None = None
    tensor_scale: float = 1.0  # tensor image / working image
    metadata: dict[str, Any] = field(default_factory=dict)
    reports: list[StageReport] = field(default_factory=list)

    @property
    def original_size(self) -> tuple[int, int]:
        h, w = self.original.shape[:2]
        return w, h


class PreprocessingStage(ABC):
    name: ClassVar[str]
    label: ClassVar[str]

    def __init__(self, **options: Any):
        self.options = options

    def is_applicable(self, ctx: PreprocessingContext) -> tuple[bool, str]:
        return True, ""

    @abstractmethod
    def apply(self, ctx: PreprocessingContext) -> dict[str, Any]:
        """Mutate ``ctx`` and return details for the stage report."""

    def __call__(self, ctx: PreprocessingContext) -> StageReport:
        applicable, reason = self.is_applicable(ctx)
        if not applicable:
            return StageReport(self.name, self.label, "skipped", 0.0, {"reason": reason})
        started = time.perf_counter()
        details = self.apply(ctx) or {}
        return StageReport(self.name, self.label, "completed", (time.perf_counter() - started) * 1000, details)


STAGE_REGISTRY: dict[str, type[PreprocessingStage]] = {}


def register_stage(cls: type[PreprocessingStage]) -> type[PreprocessingStage]:
    STAGE_REGISTRY[cls.name] = cls
    return cls


class PreprocessingPipeline:
    def __init__(self, stages: list[PreprocessingStage]):
        if not stages or stages[0].name != "image_loading":
            raise ConfigurationError("The preprocessing pipeline must start with the 'image_loading' stage.")
        self.stages = stages

    @classmethod
    def from_names(cls, names: tuple[str, ...] | list[str], options: dict[str, dict] | None = None) -> "PreprocessingPipeline":
        options = options or {}
        unknown = [n for n in names if n not in STAGE_REGISTRY]
        if unknown:
            raise ConfigurationError(f"Unknown preprocessing stage(s): {', '.join(unknown)}")
        return cls([STAGE_REGISTRY[name](**options.get(name, {})) for name in names])

    @property
    def stage_names(self) -> list[str]:
        return [s.name for s in self.stages]

    def run(self, image_bytes: bytes, input_spec: InputSpec, metadata: dict[str, Any] | None = None) -> PreprocessingContext:
        ctx = PreprocessingContext(raw_bytes=image_bytes, input_spec=input_spec, metadata=dict(metadata or {}))
        for stage in self.stages:
            ctx.reports.append(stage(ctx))
        return ctx
