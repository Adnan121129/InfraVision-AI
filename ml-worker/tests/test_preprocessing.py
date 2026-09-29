import numpy as np
import pytest

from infravision_ml.config import DEFAULT_STAGES
from infravision_ml.exceptions import ConfigurationError, ImageDecodeError
from infravision_ml.preprocessing import PreprocessingPipeline, PreprocessingStage, register_stage
from infravision_ml.types import InputSpec

from .synthetic import concrete_surface, encode


def test_full_pipeline_reports_every_stage(defective):
    pipeline = PreprocessingPipeline.from_names(DEFAULT_STAGES)
    ctx = pipeline.run(defective[0], InputSpec(mode="image"))
    assert [r.name for r in ctx.reports] == list(DEFAULT_STAGES)
    statuses = {r.name: r.status for r in ctx.reports}
    assert statuses["resizing"] == "skipped" and statuses["tensor_conversion"] == "skipped"
    assert ctx.image.shape == ctx.original.shape


def test_resolution_normalisation_downscales_large_images():
    big = encode(concrete_surface(3000, 2000))
    ctx = PreprocessingPipeline.from_names(["image_loading", "resolution_normalization"]).run(
        big, InputSpec(mode="image"), {"working_max_side": 1500}
    )
    assert max(ctx.image.shape[:2]) == 1500
    assert ctx.scale == pytest.approx(0.5)
    assert ctx.original.shape[:2] == (2000, 3000)


def test_tiled_tensor_conversion_covers_image():
    data = encode(concrete_surface(600, 400))
    ctx = PreprocessingPipeline.from_names(DEFAULT_STAGES).run(data, InputSpec(mode="tiled", size=224, stride=112))
    assert ctx.tensor.dtype == np.float32
    assert ctx.tensor.shape[1:] == (3, 224, 224)
    rows, cols = ctx.grid_shape
    assert rows * cols == len(ctx.tiles) == ctx.tensor.shape[0]
    assert max(t[2] for t in ctx.tiles) == 600 and max(t[3] for t in ctx.tiles) == 400


def test_small_images_are_upscaled_for_tiling():
    data = encode(concrete_surface(160, 120))
    ctx = PreprocessingPipeline.from_names(DEFAULT_STAGES).run(data, InputSpec(mode="tiled", size=224, stride=112))
    assert ctx.tensor.shape[0] >= 1
    assert ctx.tiles[0][2] <= 160 + 1


def test_invalid_bytes_raise_decode_error():
    with pytest.raises(ImageDecodeError):
        PreprocessingPipeline.from_names(DEFAULT_STAGES).run(b"not an image", InputSpec())


def test_unknown_stage_is_rejected():
    with pytest.raises(ConfigurationError):
        PreprocessingPipeline.from_names(["image_loading", "does_not_exist"])


def test_pipeline_must_start_with_loading():
    with pytest.raises(ConfigurationError):
        PreprocessingPipeline.from_names(["noise_reduction"])


def test_custom_stages_can_be_registered(defective):
    @register_stage
    class Invert(PreprocessingStage):
        name = "test_invert"
        label = "Invert"

        def apply(self, ctx):
            ctx.image = 255 - ctx.image
            return {"ok": True}

    ctx = PreprocessingPipeline.from_names(["image_loading", "test_invert"]).run(defective[0], InputSpec())
    assert ctx.reports[-1].details == {"ok": True}
