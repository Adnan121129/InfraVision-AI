"""Transparent severity model.

Severity combines three engineering signals:

* the intrinsic criticality of the defect type (exposed rebar > spalling > crack ...)
* the physical extent of the defect in the frame (crack length / defect area)
* model confidence

The weights are deliberately simple so engineers can audit them; tune them
per asset class with ``SeverityClassifier(weights=..., thresholds=...)``.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field

DEFAULT_TYPE_WEIGHTS = {
    "EXPOSED_REBAR": 0.9,
    "DEFORMATION": 0.85,
    "SPALLING": 0.7,
    "CORROSION": 0.62,
    "CRACK": 0.55,
    "RUST": 0.4,
    "SURFACE_DAMAGE": 0.3,
    "EFFLORESCENCE": 0.25,
    "OTHER": 0.35,
}

# (minimum score, severity) evaluated top-down
DEFAULT_THRESHOLDS = ((0.66, "CRITICAL"), (0.5, "HIGH"), (0.34, "MEDIUM"), (0.0, "LOW"))


@dataclass
class SeverityClassifier:
    type_weights: dict[str, float] = field(default_factory=lambda: dict(DEFAULT_TYPE_WEIGHTS))
    thresholds: tuple[tuple[float, str], ...] = DEFAULT_THRESHOLDS

    def extent(self, defect_type: str, box_w: int, box_h: int, img_w: int, img_h: int) -> float:
        """0..1 measure of how large the defect is relative to the inspected surface."""
        if defect_type == "CRACK":
            # Cracks are thin: their length matters more than their bounding-box area.
            return min(1.0, max(box_w / img_w, box_h / img_h) / 0.6)
        area_ratio = (box_w * box_h) / float(img_w * img_h)
        return min(1.0, math.sqrt(area_ratio / 0.12))

    def score(self, defect_type: str, confidence: float, extent: float) -> float:
        weight = self.type_weights.get(defect_type, self.type_weights["OTHER"])
        return 0.5 * weight + 0.35 * extent + 0.15 * confidence

    def classify(self, defect_type: str, confidence: float, box_w: int, box_h: int, img_w: int, img_h: int) -> tuple[str, float]:
        extent = self.extent(defect_type, box_w, box_h, img_w, img_h)
        value = self.score(defect_type, confidence, extent)
        for minimum, label in self.thresholds:
            if value >= minimum:
                return label, value
        return "LOW", value
