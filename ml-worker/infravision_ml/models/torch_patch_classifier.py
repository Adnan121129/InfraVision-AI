"""Production adapter: CNN patch classifier (PyTorch) with sliding-window localisation.

Datasets such as SDNET2018 label 256x256 *patches* as cracked/uncracked. A
patch classifier trained with transfer learning (ResNet-50, EfficientNet, ...)
is run over the image with a sliding window; adjacent positive patches of the
same class are merged into bounding boxes. Multi-class checkpoints (crack,
spalling, corrosion, ...) work the same way - classes come from the model card.
"""

from __future__ import annotations

import logging
from pathlib import Path

import numpy as np

from ..config import MLSettings
from ..exceptions import ModelLoadError
from ..inference.postprocess import merge_tile_predictions
from ..preprocessing import PreprocessingContext
from ..taxonomy import normalize_label
from ..types import InputSpec, ModelInfo, RawDetection
from .base import DefectModel
from .card import ModelCard

logger = logging.getLogger(__name__)


class TorchPatchClassifier(DefectModel):
    inference_label = "CNN inference"

    def __init__(self, settings: MLSettings, card: ModelCard, checkpoint: Path):
        super().__init__(settings)
        self.card = card
        self.checkpoint = checkpoint
        self.class_types = [normalize_label(label) for label in card.classes]
        if all(t is None for t in self.class_types):
            raise ModelLoadError("The model card declares no defect classes (all classes are background).")
        self._model = None
        self._device = None

    @property
    def info(self) -> ModelInfo:
        return ModelInfo(
            name=self.card.name,
            version=self.card.version,
            framework="pytorch",
            architecture=self.card.architecture,
            is_demo=False,
            description=self.card.description,
            classes=tuple(self.card.classes),
            input_size=self.card.input_size,
            artifact_uri=str(self.checkpoint),
            training_dataset=self.card.training_dataset,
            metrics=dict(self.card.metrics),
        )

    @property
    def input_spec(self) -> InputSpec:
        stride = self.card.tile_stride or max(16, int(self.card.input_size * self.settings.tile_stride_ratio))
        return InputSpec(mode="tiled", size=self.card.input_size, stride=stride, mean=self.card.mean, std=self.card.std)

    def _resolve_device(self, torch):
        requested = self.settings.device
        if requested == "auto":
            return torch.device("cuda" if torch.cuda.is_available() else "cpu")
        return torch.device(requested)

    def load(self) -> None:
        try:
            import torch
        except ImportError as exc:
            raise ModelLoadError("PyTorch is not installed on this worker (build the ml-worker image with PyTorch).") from exc
        if not self.checkpoint.exists():
            raise ModelLoadError(f"Model checkpoint not found at {self.checkpoint}.")

        self._device = self._resolve_device(torch)
        suffix = self.checkpoint.suffix.lower()
        try:
            if suffix in (".ts", ".torchscript", ".jit"):
                model = torch.jit.load(str(self.checkpoint), map_location=self._device)
            else:
                from .architectures import build_classifier

                model = build_classifier(self.card.architecture, len(self.card.classes), pretrained=False)
                state = torch.load(str(self.checkpoint), map_location=self._device, weights_only=True)
                if isinstance(state, dict) and "state_dict" in state:
                    state = state["state_dict"]
                model.load_state_dict(state)
        except ModelLoadError:
            raise
        except Exception as exc:
            raise ModelLoadError(f"Could not load checkpoint {self.checkpoint.name}: {exc}") from exc

        model.to(self._device)
        model.eval()
        self._model = model
        self._loaded = True
        logger.info("Loaded %s %s on %s", self.card.name, self.card.version, self._device)

    def predict(self, ctx: PreprocessingContext) -> list[RawDetection]:
        import torch

        if self._model is None:
            self.load()
        if ctx.tensor is None or ctx.grid_shape is None:
            raise ModelLoadError("Preprocessing did not produce a tensor. Enable the 'resizing' and 'tensor_conversion' stages.")

        batch_size = max(1, self.settings.batch_size)
        outputs: list[np.ndarray] = []
        with torch.inference_mode():
            for start in range(0, len(ctx.tensor), batch_size):
                chunk = torch.from_numpy(ctx.tensor[start : start + batch_size]).to(self._device)
                logits = self._model(chunk)
                outputs.append(torch.softmax(logits.float(), dim=1).cpu().numpy())
        probabilities = np.concatenate(outputs, axis=0)
        ctx.metadata["tiles_evaluated"] = int(len(probabilities))
        return merge_tile_predictions(
            probabilities,
            ctx.tiles,
            ctx.grid_shape,
            self.class_types,
            threshold=self.settings.detection_threshold,
        )
