"""Model cards: the metadata file shipped next to every trained checkpoint."""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path

from ..exceptions import ModelLoadError


@dataclass
class ModelCard:
    name: str
    version: str
    architecture: str
    classes: list[str]
    framework: str = "pytorch"
    input_size: int = 224
    tile_stride: int | None = None
    mean: tuple[float, float, float] = (0.485, 0.456, 0.406)
    std: tuple[float, float, float] = (0.229, 0.224, 0.225)
    training_dataset: str = ""
    description: str = ""
    metrics: dict[str, float] = field(default_factory=dict)
    created_at: str = ""

    @classmethod
    def load(cls, path: Path) -> "ModelCard":
        if not path.exists():
            raise ModelLoadError(f"Model card not found at {path}. Train a model or set MODEL_CARD_PATH.")
        try:
            data = json.loads(path.read_text())
        except json.JSONDecodeError as exc:
            raise ModelLoadError(f"Model card {path} is not valid JSON: {exc}") from exc
        missing = [k for k in ("name", "version", "architecture", "classes") if k not in data]
        if missing:
            raise ModelLoadError(f"Model card {path} is missing: {', '.join(missing)}")
        known = {f for f in cls.__dataclass_fields__}
        payload = {k: v for k, v in data.items() if k in known}
        for key in ("mean", "std"):
            if key in payload:
                payload[key] = tuple(payload[key])
        return cls(**payload)

    def save(self, path: Path) -> None:
        data = {k: getattr(self, k) for k in self.__dataclass_fields__}
        data["mean"] = list(self.mean)
        data["std"] = list(self.std)
        path.write_text(json.dumps(data, indent=2))
