"""Model factory registry.

``INFERENCE_MODE`` selects a factory. Register additional factories (e.g. a
YOLO detector or a TensorFlow SavedModel adapter) with :func:`register_model`
- the Django application is unaffected.
"""

from __future__ import annotations

import logging
from collections.abc import Callable

from ..config import MLSettings
from ..exceptions import ConfigurationError, ModelLoadError
from .base import DefectModel
from .card import ModelCard
from .heuristic import HeuristicDemoModel

logger = logging.getLogger(__name__)

ModelFactory = Callable[[MLSettings], DefectModel]
MODEL_FACTORIES: dict[str, ModelFactory] = {}


def register_model(mode: str) -> Callable[[ModelFactory], ModelFactory]:
    def decorator(factory: ModelFactory) -> ModelFactory:
        MODEL_FACTORIES[mode] = factory
        return factory

    return decorator


@register_model("demo")
def _demo_factory(settings: MLSettings) -> DefectModel:
    return HeuristicDemoModel(settings)


@register_model("pytorch")
def _pytorch_factory(settings: MLSettings) -> DefectModel:
    from .torch_patch_classifier import TorchPatchClassifier

    checkpoint = settings.model_path or settings.model_dir / "model.pt"
    card_path = settings.model_card_path or checkpoint.with_name("model_card.json")
    return TorchPatchClassifier(settings, ModelCard.load(card_path), checkpoint)


def create_model(settings: MLSettings) -> DefectModel:
    factory = MODEL_FACTORIES.get(settings.inference_mode)
    if factory is None:
        raise ConfigurationError(
            f"Unknown INFERENCE_MODE '{settings.inference_mode}'. Available: {', '.join(sorted(MODEL_FACTORIES))}"
        )
    try:
        model = factory(settings)
        model.load()
        return model
    except ModelLoadError as exc:
        if settings.allow_demo_fallback and settings.inference_mode != "demo":
            # Explicit opt-in only: results are then labelled as demo output.
            logger.error("Production model unavailable (%s); falling back to DEMO inference.", exc)
            model = HeuristicDemoModel(settings)
            model.load()
            return model
        raise
