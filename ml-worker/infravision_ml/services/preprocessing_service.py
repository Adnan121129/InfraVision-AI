from __future__ import annotations

from ..config import MLSettings
from ..preprocessing import PreprocessingContext, PreprocessingPipeline
from ..types import InputSpec


class PreprocessingService:
    """Runs the configured OpenCV pipeline and returns a populated context."""

    def __init__(self, pipeline: PreprocessingPipeline, settings: MLSettings):
        self.pipeline = pipeline
        self.settings = settings

    @classmethod
    def from_settings(cls, settings: MLSettings) -> "PreprocessingService":
        return cls(PreprocessingPipeline.from_names(settings.preprocessing_stages), settings)

    def run(self, image_bytes: bytes, input_spec: InputSpec) -> PreprocessingContext:
        return self.pipeline.run(image_bytes, input_spec, {"working_max_side": self.settings.working_max_side})
