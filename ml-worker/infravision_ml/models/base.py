from __future__ import annotations

from abc import ABC, abstractmethod

from ..config import MLSettings
from ..preprocessing import PreprocessingContext
from ..types import InputSpec, ModelInfo, RawDetection


class DefectModel(ABC):
    """Contract every model adapter implements.

    Adapters receive a fully preprocessed :class:`PreprocessingContext` and
    return :class:`RawDetection` objects in *working image* coordinates. The
    prediction service handles coordinate mapping, severity and health scoring,
    so adapters stay small and interchangeable.
    """

    #: human readable label for the inference stage in reports
    inference_label = "CNN inference"

    def __init__(self, settings: MLSettings):
        self.settings = settings
        self._loaded = False

    @property
    @abstractmethod
    def info(self) -> ModelInfo: ...

    @property
    @abstractmethod
    def input_spec(self) -> InputSpec: ...

    def load(self) -> None:
        self._loaded = True

    @property
    def loaded(self) -> bool:
        return self._loaded

    @abstractmethod
    def predict(self, ctx: PreprocessingContext) -> list[RawDetection]: ...
