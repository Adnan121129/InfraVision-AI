"""Demo detector built from classical computer-vision heuristics.

IMPORTANT: this is **not** a trained neural network. It exists so the whole
platform (upload -> queue -> inference -> results -> alerts) can be exercised
without model weights. Every result it produces is flagged as demo output
(``ModelInfo.is_demo = True`` -> ``inference_mode = "demo"``) and the UI shows
a "Demo inference" badge. Its scores are heuristic strengths, not calibrated
probabilities.

Techniques used:
* cracks          - morphological black-hat + elongation analysis of thin dark structures
* rust/corrosion  - HSV segmentation of orange-brown oxide colours
* spalling        - large, irregular regions markedly darker than the surrounding surface
* efflorescence   - bright, desaturated deposits
"""

from __future__ import annotations

import cv2
import numpy as np

from ..preprocessing import PreprocessingContext
from ..types import BoundingBox, InputSpec, ModelInfo, RawDetection
from .base import DefectModel


class HeuristicDemoModel(DefectModel):
    inference_label = "Heuristic inference (demo)"

    @property
    def info(self) -> ModelInfo:
        return ModelInfo(
            name="InfraVision Demo Detector",
            version="0.4.0-demo",
            framework="opencv",
            architecture="Classical CV heuristics (morphology + HSV segmentation) — not a trained model",
            is_demo=True,
            description=(
                "Deterministic OpenCV heuristics used when no trained model is deployed. "
                "Outputs are demo results for exercising the platform and must not be used for engineering decisions."
            ),
            classes=("CRACK", "SPALLING", "CORROSION", "RUST", "EFFLORESCENCE"),
            input_size=None,
        )

    @property
    def input_spec(self) -> InputSpec:
        return InputSpec(mode="image")

    # -- helpers ----------------------------------------------------------------
    @staticmethod
    def _components(mask: np.ndarray, min_area: int):
        count, labels, stats, _ = cv2.connectedComponentsWithStats(mask, connectivity=8)
        for idx in range(1, count):
            x, y, w, h, area = stats[idx]
            if area >= min_area:
                yield idx, labels, (int(x), int(y), int(w), int(h), int(area))

    def _detect_cracks(self, gray: np.ndarray) -> list[RawDetection]:
        h, w = gray.shape
        short = min(h, w)
        kernel = max(9, (short // 60) | 1)
        smoothed = cv2.GaussianBlur(gray, (3, 3), 0)
        blackhat = cv2.morphologyEx(smoothed, cv2.MORPH_BLACKHAT, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (kernel, kernel)))
        # Noise-adaptive threshold: only structures far darker than the surface texture qualify.
        median = float(np.median(blackhat))
        mad = max(2.0, float(np.median(np.abs(blackhat - median))))
        threshold = max(40.0, median + 8.0 * mad)
        mask = (blackhat > threshold).astype(np.uint8)
        mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3)))

        # Group nearby fragments of the same crack before measuring them.
        group_kernel = max(5, short // 70)
        grouped = cv2.dilate(mask, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (group_kernel, group_kernel)))
        detections = []
        min_length = 0.08 * short
        for idx, labels, (x, y, bw, bh, _area) in self._components(grouped, min_area=int(0.0004 * h * w)):
            region = (labels == idx) & (mask > 0)
            points = cv2.findNonZero(region.astype(np.uint8))
            if points is None or len(points) < 25:
                continue
            (_, _), (rw, rh), _ = cv2.minAreaRect(points)
            length = max(rw, rh, bw, bh)
            mean_width = len(points) / max(1.0, length)
            if length < min_length or mean_width > 0.035 * short:
                continue  # too short, or too thick to be a crack
            contrast = float(blackhat[region].mean())
            if contrast < threshold * 1.15:
                continue
            elongation = length / max(1.0, mean_width)
            score = 0.52 + 0.2 * min(1.0, elongation / 25) + 0.18 * min(1.0, contrast / 150) + 0.08 * min(1.0, length / (0.5 * short))
            detections.append(
                RawDetection(
                    "CRACK",
                    float(min(score, 0.97)),
                    BoundingBox(x, y, x + bw, y + bh),
                    {"length_px": round(length, 1), "mean_width_px": round(mean_width, 2), "contrast": round(contrast, 1)},
                )
            )
        return detections

    def _detect_oxide(self, base: np.ndarray) -> list[RawDetection]:
        h, w = base.shape[:2]
        hsv = cv2.cvtColor(base, cv2.COLOR_BGR2HSV)
        hue, sat, val = hsv[:, :, 0], hsv[:, :, 1], hsv[:, :, 2]
        mask = ((hue >= 4) & (hue <= 24) & (sat >= 95) & (val >= 45) & (val <= 235)).astype(np.uint8)
        mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
        mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((15, 15), np.uint8))
        detections = []
        for idx, labels, (x, y, bw, bh, area) in self._components(mask, min_area=int(0.0015 * h * w)):
            region = labels == idx
            mean_sat = float(sat[region].mean()) / 255.0
            mean_val = float(val[region].mean())
            defect = "CORROSION" if mean_val < 120 or area > 0.02 * h * w else "RUST"
            score = 0.5 + 0.3 * min(1.0, mean_sat) + 0.17 * min(1.0, area / (0.03 * h * w))
            detections.append(
                RawDetection(defect, float(min(score, 0.96)), BoundingBox(x, y, x + bw, y + bh), {"mean_saturation": round(mean_sat, 3)})
            )
        return detections

    def _detect_spalling(self, gray: np.ndarray) -> list[RawDetection]:
        h, w = gray.shape
        short = min(h, w)
        smooth = cv2.GaussianBlur(gray, (0, 0), sigmaX=max(2.0, short / 150))
        median = float(np.median(smooth))
        mad = float(np.median(np.abs(smooth - median))) + 1.0
        dark = (smooth < median - max(22.0, 3.0 * mad)).astype(np.uint8)
        dark = cv2.morphologyEx(dark, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7)))
        laplacian = cv2.Laplacian(gray, cv2.CV_32F)
        min_thickness = max(6.0, 0.02 * short)
        detections = []
        for idx, labels, (x, y, bw, bh, area) in self._components(dark, min_area=int(0.004 * h * w)):
            region = (labels == idx).astype(np.uint8)
            # Spalls are thick patches; thin dark structures are cracks or joints.
            thickness = float(cv2.distanceTransform(region, cv2.DIST_L2, 5).max())
            if thickness < min_thickness or area / float(bw * bh) < 0.3:
                continue
            contours, _ = cv2.findContours(region, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            contour = max(contours, key=cv2.contourArea)
            hull_area = cv2.contourArea(cv2.convexHull(contour)) or 1.0
            solidity = cv2.contourArea(contour) / hull_area
            texture = float(laplacian[region > 0].std()) / 255.0
            depth = (median - float(smooth[region > 0].mean())) / 255.0
            score = 0.5 + 0.22 * min(1.0, depth * 4) + 0.14 * min(1.0, (1.0 - solidity) * 3) + 0.1 * min(1.0, texture * 6)
            detections.append(
                RawDetection("SPALLING", float(min(score, 0.95)), BoundingBox(x, y, x + bw, y + bh), {"solidity": round(solidity, 3)})
            )
        return detections

    def _detect_efflorescence(self, base: np.ndarray) -> list[RawDetection]:
        h, w = base.shape[:2]
        hsv = cv2.cvtColor(base, cv2.COLOR_BGR2HSV)
        sat, val = hsv[:, :, 1], hsv[:, :, 2]
        bright_level = max(205.0, float(np.percentile(val, 99.0)))
        mask = ((val >= bright_level) & (sat <= 35)).astype(np.uint8)
        mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8))
        detections = []
        for idx, labels, (x, y, bw, bh, area) in self._components(mask, min_area=int(0.003 * h * w)):
            score = 0.5 + 0.25 * min(1.0, area / (0.02 * h * w))
            detections.append(RawDetection("EFFLORESCENCE", float(min(score, 0.9)), BoundingBox(x, y, x + bw, y + bh)))
        return detections

    # -- contract ---------------------------------------------------------------
    def predict(self, ctx: PreprocessingContext) -> list[RawDetection]:
        gray = cv2.cvtColor(ctx.image, cv2.COLOR_BGR2GRAY)
        base = ctx.base if ctx.base is not None else ctx.image
        oxide = self._detect_oxide(base)
        # dark oxide patches are rust/corrosion, not spalls
        spalls = [
            s for s in self._detect_spalling(cv2.cvtColor(base, cv2.COLOR_BGR2GRAY))
            if not any(o.box.overlap_of_smaller(s.box) > 0.6 for o in oxide)
        ]
        cracks = [c for c in self._detect_cracks(gray) if not any(s.box.overlap_of_smaller(c.box) > 0.7 for s in spalls)]
        return cracks + spalls + oxide + self._detect_efflorescence(base)
