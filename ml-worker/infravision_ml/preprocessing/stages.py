"""Built-in OpenCV preprocessing stages."""

from __future__ import annotations

from typing import Any

import cv2
import numpy as np

from ..exceptions import ImageDecodeError
from .base import PreprocessingContext, PreprocessingStage, register_stage


@register_stage
class ImageLoading(PreprocessingStage):
    name = "image_loading"
    label = "Image loading"

    def apply(self, ctx: PreprocessingContext) -> dict[str, Any]:
        buffer = np.frombuffer(ctx.raw_bytes, dtype=np.uint8)
        # IMREAD_COLOR honours EXIF orientation, matching how browsers display the image.
        image = cv2.imdecode(buffer, cv2.IMREAD_COLOR) if buffer.size else None
        if image is None:
            raise ImageDecodeError()
        ctx.original = image
        ctx.image = image
        ctx.base = image
        h, w = image.shape[:2]
        return {"width": w, "height": h, "bytes": len(ctx.raw_bytes)}


@register_stage
class ResolutionNormalization(PreprocessingStage):
    name = "resolution_normalization"
    label = "Resolution normalization"

    def apply(self, ctx: PreprocessingContext) -> dict[str, Any]:
        max_side = int(self.options.get("max_side", ctx.metadata.get("working_max_side", 2048)))
        h, w = ctx.image.shape[:2]
        longest = max(h, w)
        if longest > max_side:
            scale = max_side / longest
            ctx.image = cv2.resize(ctx.image, (round(w * scale), round(h * scale)), interpolation=cv2.INTER_AREA)
            ctx.scale = scale
        ctx.base = ctx.image.copy()
        nh, nw = ctx.image.shape[:2]
        return {"working_width": nw, "working_height": nh, "scale": round(ctx.scale, 4)}


@register_stage
class NoiseReduction(PreprocessingStage):
    name = "noise_reduction"
    label = "Noise reduction"

    def apply(self, ctx: PreprocessingContext) -> dict[str, Any]:
        diameter = int(self.options.get("diameter", 5))
        sigma = float(self.options.get("sigma", 35))
        ctx.image = cv2.bilateralFilter(ctx.image, diameter, sigma, sigma)
        return {"method": "bilateral", "diameter": diameter, "sigma": sigma}


@register_stage
class ColorNormalization(PreprocessingStage):
    name = "color_normalization"
    label = "Color normalization"

    def apply(self, ctx: PreprocessingContext) -> dict[str, Any]:
        """Gray-world white balance: neutralises colour casts from sensors and lighting."""
        image = ctx.image.astype(np.float32)
        means = image.reshape(-1, 3).mean(axis=0)
        gray = float(means.mean())
        gains = np.clip(gray / np.maximum(means, 1e-3), 0.6, 1.6)
        ctx.image = np.clip(image * gains, 0, 255).astype(np.uint8)
        return {"method": "gray-world", "gains_bgr": [round(float(g), 3) for g in gains]}


@register_stage
class LightingCorrection(PreprocessingStage):
    name = "lighting_correction"
    label = "Lighting correction"

    def apply(self, ctx: PreprocessingContext) -> dict[str, Any]:
        """Flatten uneven illumination (shadows, vignetting) on the L channel."""
        lab = cv2.cvtColor(ctx.image, cv2.COLOR_BGR2LAB)
        lightness = lab[:, :, 0].astype(np.float32)
        sigma = max(ctx.image.shape[:2]) / 25
        illumination = cv2.GaussianBlur(lightness, (0, 0), sigmaX=sigma)
        target = float(illumination.mean())
        corrected = lightness / np.maximum(illumination, 1.0) * target
        lab[:, :, 0] = np.clip(corrected, 0, 255).astype(np.uint8)
        ctx.image = cv2.cvtColor(lab, cv2.COLOR_LAB2BGR)
        spread = float(illumination.max() - illumination.min())
        return {"method": "illumination-flattening", "illumination_range": round(spread, 1)}


@register_stage
class ContrastEnhancement(PreprocessingStage):
    name = "contrast_enhancement"
    label = "Contrast enhancement"

    def apply(self, ctx: PreprocessingContext) -> dict[str, Any]:
        clip_limit = float(self.options.get("clip_limit", 2.0))
        grid = int(self.options.get("grid", 8))
        lab = cv2.cvtColor(ctx.image, cv2.COLOR_BGR2LAB)
        clahe = cv2.createCLAHE(clipLimit=clip_limit, tileGridSize=(grid, grid))
        lab[:, :, 0] = clahe.apply(lab[:, :, 0])
        ctx.image = cv2.cvtColor(lab, cv2.COLOR_LAB2BGR)
        return {"method": "CLAHE", "clip_limit": clip_limit, "grid": grid}


@register_stage
class EdgeEnhancement(PreprocessingStage):
    name = "edge_enhancement"
    label = "Edge enhancement"

    def apply(self, ctx: PreprocessingContext) -> dict[str, Any]:
        amount = float(self.options.get("amount", 0.6))
        blurred = cv2.GaussianBlur(ctx.image, (0, 0), sigmaX=2.0)
        ctx.image = cv2.addWeighted(ctx.image, 1 + amount, blurred, -amount, 0)
        return {"method": "unsharp-mask", "amount": amount}


@register_stage
class Resizing(PreprocessingStage):
    name = "resizing"
    label = "Image resizing"

    def is_applicable(self, ctx):
        if ctx.input_spec.mode == "image":
            return False, "Model consumes the enhanced image directly"
        return True, ""

    def apply(self, ctx: PreprocessingContext) -> dict[str, Any]:
        spec = ctx.input_spec
        h, w = ctx.image.shape[:2]
        if spec.mode == "whole":
            ctx.metadata["model_view"] = cv2.resize(ctx.image, (spec.size, spec.size), interpolation=cv2.INTER_AREA)
            ctx.tensor_scale = 1.0
            return {"target": f"{spec.size}x{spec.size}", "mode": "whole-image"}
        # Tiled: make sure the image is at least one tile in each dimension.
        scale = max(1.0, spec.size / min(h, w))
        view = ctx.image if scale == 1.0 else cv2.resize(ctx.image, (round(w * scale), round(h * scale)), interpolation=cv2.INTER_CUBIC)
        ctx.metadata["model_view"] = view
        ctx.tensor_scale = scale
        vh, vw = view.shape[:2]
        return {"target": f"{vw}x{vh}", "mode": "sliding-window", "tile": spec.size}


@register_stage
class TensorConversion(PreprocessingStage):
    name = "tensor_conversion"
    label = "Tensor conversion"

    def is_applicable(self, ctx):
        if ctx.input_spec.mode == "image":
            return False, "Model consumes the enhanced image directly"
        if "model_view" not in ctx.metadata:
            return False, "Resizing stage not configured"
        return True, ""

    def apply(self, ctx: PreprocessingContext) -> dict[str, Any]:
        from ..inference.tiling import tile_grid

        spec = ctx.input_spec
        view = ctx.metadata["model_view"]
        rgb = cv2.cvtColor(view, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
        mean = np.asarray(spec.mean, dtype=np.float32)
        std = np.asarray(spec.std, dtype=np.float32)
        normalized = (rgb - mean) / std

        if spec.mode == "whole":
            ctx.tensor = normalized.transpose(2, 0, 1)[None, ...].copy()
            ctx.tiles = [(0, 0, ctx.image.shape[1], ctx.image.shape[0])]
            ctx.grid_shape = (1, 1)
        else:
            stride = spec.stride or spec.size // 2
            boxes, grid_shape = tile_grid(view.shape[1], view.shape[0], spec.size, stride)
            patches = np.stack([normalized[y0:y1, x0:x1] for (x0, y0, x1, y1) in boxes])
            ctx.tensor = patches.transpose(0, 3, 1, 2).copy()
            inv = 1.0 / ctx.tensor_scale
            ctx.tiles = [(round(x0 * inv), round(y0 * inv), round(x1 * inv), round(y1 * inv)) for (x0, y0, x1, y1) in boxes]
            ctx.grid_shape = grid_shape
        return {"shape": list(ctx.tensor.shape), "dtype": "float32", "normalization": "ImageNet mean/std"}
