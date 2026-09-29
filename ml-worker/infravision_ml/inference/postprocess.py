"""Turn raw model outputs into clean, de-duplicated detections."""

from __future__ import annotations

import numpy as np

from ..types import BoundingBox, RawDetection


def merge_tile_predictions(
    probabilities: np.ndarray,
    tiles: list[tuple[int, int, int, int]],
    grid_shape: tuple[int, int],
    class_types: list[str | None],
    threshold: float,
) -> list[RawDetection]:
    """Group adjacent positive tiles of the same class into bounding boxes.

    ``probabilities`` is (num_tiles, num_classes) softmax output, ``class_types``
    maps each class index to a canonical defect type (``None`` = background).
    Adjacent (8-connected) tiles above ``threshold`` form one detection whose
    confidence is the highest tile probability in the group.
    """
    import cv2

    rows, cols = grid_shape
    detections: list[RawDetection] = []
    for class_index, defect_type in enumerate(class_types):
        if defect_type is None:
            continue
        grid = probabilities[:, class_index].reshape(rows, cols)
        # a tile belongs to this class when it is above threshold and this class is its argmax
        argmax = probabilities.argmax(axis=1).reshape(rows, cols)
        mask = ((grid >= threshold) & (argmax == class_index)).astype(np.uint8)
        if not mask.any():
            continue
        count, labels = cv2.connectedComponents(mask, connectivity=8)
        for component in range(1, count):
            cells = np.argwhere(labels == component)
            box = None
            scores = []
            for r, c in cells:
                x0, y0, x1, y1 = tiles[r * cols + c]
                tile_box = BoundingBox(x0, y0, x1, y1)
                box = tile_box if box is None else box.union(tile_box)
                scores.append(float(grid[r, c]))
            detections.append(
                RawDetection(
                    defect_type=defect_type,
                    score=max(scores),
                    box=box,
                    extras={"tiles": len(scores), "mean_score": float(np.mean(scores))},
                )
            )
    return detections


def non_max_suppression(detections: list[RawDetection], iou_threshold: float = 0.45, containment: float = 0.85) -> list[RawDetection]:
    """Class-aware NMS; also drops boxes almost fully contained in a stronger box of the same class."""
    kept: list[RawDetection] = []
    for det in sorted(detections, key=lambda d: d.score, reverse=True):
        duplicate = any(
            k.defect_type == det.defect_type
            and (k.box.iou(det.box) > iou_threshold or k.box.overlap_of_smaller(det.box) > containment)
            for k in kept
        )
        if not duplicate:
            kept.append(det)
    return kept


def to_original_space(det: RawDetection, scale: float, width: int, height: int) -> BoundingBox:
    """Map a working-image box back to original pixel coordinates."""
    factor = 1.0 / scale if scale else 1.0
    return det.box.scaled(factor).clipped(width, height)
