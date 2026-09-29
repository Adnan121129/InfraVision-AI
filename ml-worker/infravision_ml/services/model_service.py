from __future__ import annotations

import logging
import threading

from ..config import MLSettings
from ..models import DefectModel, create_model
from ..types import ModelInfo

logger = logging.getLogger(__name__)


class ModelService:
    """Owns the model lifecycle: lazy loading, caching and metadata."""

    def __init__(self, settings: MLSettings, model: DefectModel | None = None):
        self.settings = settings
        self._model = model
        self._lock = threading.Lock()

    @property
    def model(self) -> DefectModel:
        if self._model is None:
            with self._lock:
                if self._model is None:
                    self._model = create_model(self.settings)
                    logger.info("Model ready: %s %s (demo=%s)", self._model.info.name, self._model.info.version, self._model.info.is_demo)
        return self._model

    @property
    def info(self) -> ModelInfo:
        return self.model.info

    def warmup(self) -> None:
        _ = self.model
