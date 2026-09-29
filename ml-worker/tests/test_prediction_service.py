import cv2
import numpy as np

from infravision_ml.services import build_prediction_service

from .synthetic import concrete_surface, draw_crack, draw_spall, encode


def _overlaps(box, truth, min_iou=0.5):
    x0, y0, x1, y1 = truth
    ix = max(0, min(box["x_max"], x1) - max(box["x_min"], x0))
    iy = max(0, min(box["y_max"], y1) - max(box["y_min"], y0))
    inter = ix * iy
    union = (box["x_max"] - box["x_min"]) * (box["y_max"] - box["y_min"]) + (x1 - x0) * (y1 - y0) - inter
    return inter / union >= min_iou


def test_demo_service_is_clearly_flagged(settings, defective):
    service = build_prediction_service(settings)
    result = service.predict(defective[0])
    assert result.inference_mode == "demo"
    assert result.model.is_demo is True
    assert "not a trained model" in result.model.architecture


def test_demo_detector_finds_crack_and_rust(settings, defective):
    data, truth = defective
    stages = []
    result = build_prediction_service(settings).predict(data, on_stage=stages.append)
    assert stages == ["preprocessing", "inference", "postprocessing"]
    payload = result.to_dict()
    types = {d["defect_type"] for d in payload["detections"]}
    assert "CRACK" in types and types & {"RUST", "CORROSION"}
    crack = next(d for d in payload["detections"] if d["defect_type"] == "CRACK")
    assert _overlaps(crack["bbox"], truth["crack"])
    assert result.health_score < 75
    assert result.annotated_image and result.annotated_image[:2] == b"\xff\xd8"
    names = [s["name"] for s in payload["preprocessing"]]
    assert names[-2:] == ["model_inference", "postprocessing"]


def test_clean_surface_has_no_findings(settings, clean):
    result = build_prediction_service(settings).predict(clean)
    assert result.detections == []
    assert result.health_score == 100.0


def test_spall_is_not_reported_as_crack(settings):
    image = concrete_surface(seed=21)
    truth = draw_spall(image, (400, 400))
    result = build_prediction_service(settings).predict(encode(image))
    spalls = [d for d in result.detections if d.defect_type == "SPALLING"]
    assert spalls and _overlaps(spalls[0].bbox.to_dict(), truth)


def test_boxes_are_in_original_coordinates_for_downscaled_images(settings):
    image = concrete_surface(3000, 2000, seed=4)
    truth = draw_crack(image, (400, 600), steps=80, step_len=24)
    small_settings = type(settings)(inference_mode="demo", working_max_side=1200, annotate=False)
    result = build_prediction_service(small_settings).predict(encode(image))
    assert (result.image_width, result.image_height) == (3000, 2000)
    crack = next(d for d in result.detections if d.defect_type == "CRACK")
    assert _overlaps(crack.bbox.to_dict(), truth, 0.4)


def test_png_with_alpha_is_supported(settings):
    image = concrete_surface(400, 300)
    rgba = cv2.cvtColor(image, cv2.COLOR_BGR2BGRA)
    rgba[:, :, 3] = 200
    result = build_prediction_service(settings).predict(encode(rgba, ".png"))
    assert result.image_width == 400 and isinstance(result.health_score, float)
    assert np.isfinite(result.health_score)
