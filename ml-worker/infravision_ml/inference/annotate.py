"""Render detections onto a browser-sized JPEG (used for reports and exports)."""

from __future__ import annotations

import cv2
import numpy as np

from ..taxonomy import DISPLAY_NAMES

# BGR colours aligned with the dashboard severity palette
SEVERITY_COLORS = {
    "LOW": (153, 211, 52),
    "MEDIUM": (36, 191, 251),
    "HIGH": (60, 146, 251),
    "CRITICAL": (94, 63, 244),
}


def annotate_image(image: np.ndarray, detections: list, max_side: int = 1600, quality: int = 85) -> bytes:
    h, w = image.shape[:2]
    scale = min(1.0, max_side / max(h, w))
    canvas = cv2.resize(image, (round(w * scale), round(h * scale)), interpolation=cv2.INTER_AREA) if scale < 1 else image.copy()
    thickness = max(2, round(max(canvas.shape[:2]) / 500))
    font_scale = max(0.45, max(canvas.shape[:2]) / 1800)
    for det in detections:
        color = SEVERITY_COLORS.get(det.severity, (255, 255, 255))
        box = det.bbox.scaled(scale)
        cv2.rectangle(canvas, (box.x_min, box.y_min), (box.x_max, box.y_max), color, thickness, cv2.LINE_AA)
        label = f"{DISPLAY_NAMES.get(det.defect_type, det.defect_type)} {det.confidence:.0%}"
        (tw, th), baseline = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, font_scale, 1)
        top = max(0, box.y_min - th - baseline - 4)
        cv2.rectangle(canvas, (box.x_min, top), (box.x_min + tw + 8, top + th + baseline + 4), color, -1)
        cv2.putText(canvas, label, (box.x_min + 4, top + th + 1), cv2.FONT_HERSHEY_SIMPLEX, font_scale, (15, 15, 15), 1, cv2.LINE_AA)
    ok, encoded = cv2.imencode(".jpg", canvas, [cv2.IMWRITE_JPEG_QUALITY, quality])
    return encoded.tobytes() if ok else b""
