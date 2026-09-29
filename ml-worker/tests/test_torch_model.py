"""Production path: train a tiny classifier, load it through the registry and run inference."""

import json

import pytest

torch = pytest.importorskip("torch")
pytest.importorskip("torchvision")

import cv2  # noqa: E402

from infravision_ml.config import MLSettings  # noqa: E402
from infravision_ml.exceptions import ModelLoadError  # noqa: E402
from infravision_ml.models import create_model  # noqa: E402
from infravision_ml.services import build_prediction_service  # noqa: E402
from infravision_ml.training import train_patch_classifier  # noqa: E402

from .synthetic import concrete_surface, draw_crack, encode  # noqa: E402


def _make_dataset(root, per_class=12):
    for split in ("train", "val"):
        for label in ("crack", "no_defect"):
            folder = root / split / label
            folder.mkdir(parents=True)
            for i in range(per_class):
                img = concrete_surface(256, 256, seed=i + (100 if split == "val" else 0))
                if label == "crack":
                    draw_crack(img, (10, 60 + i * 5), steps=30, step_len=9, seed=i)
                cv2.imwrite(str(folder / f"{i}.jpg"), img)


@pytest.fixture(scope="module")
def trained_model(tmp_path_factory):
    root = tmp_path_factory.mktemp("sdnet")
    _make_dataset(root / "data")
    out = root / "model"
    best = train_patch_classifier.main(
        [
            "--data-dir", str(root / "data"),
            "--output-dir", str(out),
            "--arch", "resnet18",
            "--epochs", "1",
            "--freeze-epochs", "0",
            "--batch-size", "8",
            "--num-workers", "0",
            "--no-pretrained",
            "--img-size", "96",
            "--version", "0.0.1-test",
        ]
    )
    return out, best


def test_training_writes_checkpoint_and_card(trained_model):
    out, best = trained_model
    card = json.loads((out / "model_card.json").read_text())
    assert (out / "model.pt").exists()
    assert card["classes"] == ["crack", "no_defect"]
    assert card["architecture"] == "resnet18"
    assert set(card["metrics"]) == {"accuracy", "precision", "recall", "f1"}
    assert 0.0 <= best["accuracy"] <= 1.0


def test_registry_loads_pytorch_model_and_predicts(trained_model):
    out, _ = trained_model
    settings = MLSettings(inference_mode="pytorch", model_dir=out, model_path=out / "model.pt", device="cpu", detection_threshold=0.0, batch_size=16)
    service = build_prediction_service(settings)
    info = service.model_info
    assert info.is_demo is False and info.framework == "pytorch"
    image = concrete_surface(400, 300)
    draw_crack(image, (20, 150))
    result = service.predict(encode(image))
    assert result.inference_mode == "production"
    names = [s.name for s in result.preprocessing]
    assert "tensor_conversion" in names
    tensor_stage = next(s for s in result.preprocessing if s.name == "tensor_conversion")
    assert tensor_stage.status == "completed"
    for det in result.detections:
        assert det.defect_type == "CRACK"
        assert 0 <= det.bbox.x_min < det.bbox.x_max <= 400


def test_missing_checkpoint_fails_loudly(tmp_path):
    (tmp_path / "model_card.json").write_text(json.dumps({"name": "x", "version": "1", "architecture": "resnet18", "classes": ["crack", "no_defect"]}))
    settings = MLSettings(inference_mode="pytorch", model_dir=tmp_path, model_path=tmp_path / "model.pt")
    with pytest.raises(ModelLoadError):
        create_model(settings)


def test_demo_fallback_requires_opt_in(tmp_path):
    settings = MLSettings(inference_mode="pytorch", model_dir=tmp_path, model_path=tmp_path / "model.pt", allow_demo_fallback=True)
    model = create_model(settings)
    assert model.info.is_demo is True
