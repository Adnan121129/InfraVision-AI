"""Structural health score (0-100) derived from detections."""

from __future__ import annotations

import math
from collections.abc import Iterable

SEVERITY_PENALTY = {"LOW": 2.0, "MEDIUM": 5.5, "HIGH": 11.0, "CRITICAL": 22.0}
# A single severe finding caps the score regardless of how clean the rest is.
SEVERITY_CAP = {"CRITICAL": 58.0, "HIGH": 72.0}
DECAY = 90.0


def health_score(detections: Iterable) -> float:
    """100 = no findings. Penalties grow with severity and are weighted by confidence."""
    penalty = 0.0
    cap = 100.0
    for det in detections:
        severity = det.severity
        confidence = float(det.confidence)
        penalty += SEVERITY_PENALTY.get(severity, 2.0) * (0.5 + 0.5 * confidence)
        cap = min(cap, SEVERITY_CAP.get(severity, 100.0))
    score = 100.0 * math.exp(-penalty / DECAY)
    return round(max(0.0, min(score, cap)), 2)
