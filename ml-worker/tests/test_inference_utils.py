import numpy as np

from infravision_ml.inference import SeverityClassifier, health_score, merge_tile_predictions, non_max_suppression, tile_grid
from infravision_ml.taxonomy import normalize_label
from infravision_ml.types import BoundingBox, Detection, RawDetection


def test_tile_grid_last_tile_is_flush():
    boxes, (rows, cols) = tile_grid(500, 300, 224, 112)
    assert rows * cols == len(boxes)
    assert boxes[-1] == (276, 76, 500, 300)


def test_merge_tile_predictions_groups_adjacent_tiles():
    boxes, grid = tile_grid(448, 224, 224, 112)  # 1 row x 3 cols
    probs = np.array([[0.1, 0.9], [0.2, 0.8], [0.9, 0.1]])
    dets = merge_tile_predictions(probs, boxes, grid, [None, "CRACK"], threshold=0.5)
    assert len(dets) == 1
    assert dets[0].box == BoundingBox(0, 0, 336, 224)
    assert dets[0].score == 0.9


def test_nms_suppresses_duplicates_of_same_class_only():
    a = RawDetection("CRACK", 0.9, BoundingBox(0, 0, 100, 100))
    b = RawDetection("CRACK", 0.7, BoundingBox(5, 5, 100, 100))
    c = RawDetection("RUST", 0.6, BoundingBox(5, 5, 100, 100))
    kept = non_max_suppression([b, a, c])
    assert {(d.defect_type, d.score) for d in kept} == {("CRACK", 0.9), ("RUST", 0.6)}


def test_severity_increases_with_extent_and_type():
    clf = SeverityClassifier()
    small, _ = clf.classify("CRACK", 0.7, 40, 10, 1000, 1000)
    long, _ = clf.classify("CRACK", 0.95, 600, 40, 1000, 1000)
    rebar, _ = clf.classify("EXPOSED_REBAR", 0.9, 300, 300, 1000, 1000)
    order = ["LOW", "MEDIUM", "HIGH", "CRITICAL"]
    assert order.index(long) > order.index(small)
    assert rebar == "CRITICAL"


def _det(severity, confidence=0.9):
    return Detection("CRACK", confidence, BoundingBox(0, 0, 10, 10), severity, 0.01, "")


def test_health_score_bounds_and_caps():
    assert health_score([]) == 100.0
    assert health_score([_det("LOW")]) > 95
    assert health_score([_det("CRITICAL")]) <= 58
    assert health_score([_det("CRITICAL")] * 6) < 30
    assert health_score([_det("HIGH")]) <= 72


def test_label_normalisation():
    assert normalize_label("CD") == "CRACK"
    assert normalize_label("uncracked") is None
    assert normalize_label("Exposed Rebar") == "EXPOSED_REBAR"
    assert normalize_label("mystery") == "OTHER"
