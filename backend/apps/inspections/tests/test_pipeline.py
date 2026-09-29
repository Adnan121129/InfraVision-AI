"""End-to-end inspection workflow: upload -> queue -> (eager) ML worker -> predictions -> alerts."""

from datetime import timedelta
from unittest import mock

import pytest
from django.test import override_settings
from django.utils import timezone

from apps.alerts.models import MaintenanceAlert
from apps.core.exceptions import StorageUnavailable
from apps.inspections.models import ImageRecord, InspectionLog, InspectionStatus
from apps.inspections.tasks import generate_image_derivatives, recover_stalled_inspections
from apps.ml.services import reset_prediction_service
from conftest import jpeg_bytes

pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def _fresh_service():
    reset_prediction_service()
    yield
    reset_prediction_service()


def _create(client, asset):
    response = client.post("/api/inspections/", {"structural_asset": asset.pk, "inspection_type": "DRONE", "notes": "Deck soffit survey"})
    assert response.status_code == 201, response.json()
    return response.json()


def test_viewer_cannot_create_inspections(client_for, viewer, asset):
    assert client_for(viewer).post("/api/inspections/", {"structural_asset": asset.pk}).status_code == 403


def test_full_ai_inspection_flow(client_for, inspector, asset, cracked_upload):
    client = client_for(inspector)
    inspection = _create(client, asset)
    assert inspection["status"] == "PENDING" and inspection["reference"].startswith("INS-")

    upload = client.post("/api/images/upload/", {"inspection": inspection["id"], "file": cracked_upload()}, format="multipart")
    assert upload.status_code == 201, upload.json()
    assert upload.json()["image_width"] == 1024

    submitted = client.post(f"/api/inspections/{inspection['id']}/submit/")
    assert submitted.status_code == 202

    # CELERY_TASK_ALWAYS_EAGER runs the ML worker task synchronously with the demo model
    record = InspectionLog.objects.get(pk=inspection["id"])
    assert record.status == InspectionStatus.COMPLETED, record.error_message
    assert record.inference_mode == "demo"
    assert record.celery_task_id
    assert record.defect_count >= 1
    assert record.overall_health_score < 100
    assert record.ml_model.is_demo is True
    assert [s["name"] for s in record.preprocessing_report][-2:] == ["model_inference", "postprocessing"]

    results = client.get(f"/api/inspections/{inspection['id']}/results/").json()
    assert results["model"]["is_demo"] is True
    image = results["images"][0]
    crack = next(d for d in image["detections"] if d["defect_type"] == "CRACK")
    assert 0 <= crack["x_min"] < crack["x_max"] <= 1024
    assert image["annotated_url"]
    assert sum(results["summary"]["severity_counts"].values()) == results["summary"]["defect_count"]
    assert len(results["confidence_distribution"]) == 6

    asset.refresh_from_db()
    assert asset.current_health_score == pytest.approx(record.overall_health_score, abs=0.1)
    assert asset.last_inspection_at is not None

    status_payload = client.get(f"/api/inspections/{inspection['id']}/status/").json()
    assert status_payload["processing_stage"] == "COMPLETED"


def test_severe_findings_raise_alerts(client_for, inspector, asset, cracked_upload):
    from apps.core.models import PlatformConfiguration

    config = PlatformConfiguration.load()
    config.alert_min_severity = "MEDIUM"
    config.save()
    client = client_for(inspector)
    inspection = _create(client, asset)
    client.post("/api/images/upload/", {"inspection": inspection["id"], "file": cracked_upload()}, format="multipart")
    client.post(f"/api/inspections/{inspection['id']}/submit/")
    alerts = MaintenanceAlert.objects.filter(inspection_id=inspection["id"])
    assert alerts.exists()
    assert "demo inference result" in alerts.first().description


def test_submit_requires_images_and_is_not_repeatable(client_for, inspector, asset, upload_file):
    client = client_for(inspector)
    inspection = _create(client, asset)
    empty = client.post(f"/api/inspections/{inspection['id']}/submit/")
    assert empty.status_code == 400
    client.post("/api/images/upload/", {"inspection": inspection["id"], "file": upload_file()}, format="multipart")
    assert client.post(f"/api/inspections/{inspection['id']}/submit/").status_code == 202
    again = client.post(f"/api/inspections/{inspection['id']}/submit/")
    assert again.status_code == 409
    late_upload = client.post("/api/images/upload/", {"inspection": inspection["id"], "file": upload_file()}, format="multipart")
    assert late_upload.status_code == 409


@pytest.mark.parametrize(
    "name,content,message",
    [
        ("scan.gif", b"GIF89a", "Unsupported file type"),
        ("fake.jpg", b"this is not an image at all", "not a valid"),
        ("tiny.png", jpeg_bytes(20, 20, fmt="PNG"), "too small"),
    ],
)
def test_upload_validation(client_for, inspector, asset, upload_file, name, content, message):
    client = client_for(inspector)
    inspection = _create(client, asset)
    response = client.post("/api/images/upload/", {"inspection": inspection["id"], "file": upload_file(name, content)}, format="multipart")
    assert response.status_code == 400
    assert message in response.json()["detail"]


@override_settings(MAX_IMAGE_UPLOAD_MB=0)
def test_upload_size_limit(client_for, inspector, asset, upload_file):
    client = client_for(inspector)
    inspection = _create(client, asset)
    response = client.post("/api/images/upload/", {"inspection": inspection["id"], "file": upload_file()}, format="multipart")
    assert response.status_code == 400 and "limit" in response.json()["detail"]


def test_storage_outage_returns_503(client_for, inspector, asset, upload_file):
    client = client_for(inspector)
    inspection = _create(client, asset)
    with mock.patch("apps.core.storage.ObjectStorage.save", side_effect=StorageUnavailable()):
        response = client.post("/api/images/upload/", {"inspection": inspection["id"], "file": upload_file()}, format="multipart")
    assert response.status_code == 503
    assert response.json()["code"] == "storage_unavailable"
    assert not ImageRecord.objects.exists()


def test_inference_failure_marks_inspection_failed_and_retry_recovers(client_for, inspector, asset, upload_file):
    client = client_for(inspector)
    inspection = _create(client, asset)
    client.post("/api/images/upload/", {"inspection": inspection["id"], "file": upload_file()}, format="multipart")
    with mock.patch("infravision_ml.services.prediction_service.PredictionService.predict", side_effect=RuntimeError("GPU exploded")):
        client.post(f"/api/inspections/{inspection['id']}/submit/")
    record = InspectionLog.objects.get(pk=inspection["id"])
    assert record.status == InspectionStatus.FAILED
    assert "RuntimeError" in record.error_message

    retried = client.post(f"/api/inspections/{inspection['id']}/retry/")
    assert retried.status_code == 202
    record.refresh_from_db()
    assert record.status == InspectionStatus.COMPLETED
    assert record.attempts == 2


def test_queue_unavailable_is_reported(client_for, inspector, asset, upload_file):
    client = client_for(inspector)
    inspection = _create(client, asset)
    client.post("/api/images/upload/", {"inspection": inspection["id"], "file": upload_file()}, format="multipart")
    with mock.patch("apps.inspections.tasks.run_inference.apply_async", side_effect=ConnectionError("redis down")):
        response = client.post(f"/api/inspections/{inspection['id']}/submit/")
    assert response.status_code == 503
    assert InspectionLog.objects.get(pk=inspection["id"]).status == InspectionStatus.FAILED


def test_image_derivatives_are_generated(client_for, inspector, asset, upload_file):
    client = client_for(inspector)
    inspection = _create(client, asset)
    image_id = client.post(
        "/api/images/upload/", {"inspection": inspection["id"], "file": upload_file(content=jpeg_bytes(3000, 2000))}, format="multipart"
    ).json()["id"]
    generate_image_derivatives(image_id)
    image = ImageRecord.objects.get(pk=image_id)
    assert image.thumbnail_key.endswith("_thumb.jpg") and image.preview_key.endswith("_preview.jpg")
    from apps.core.storage import object_storage
    from PIL import Image
    import io

    with Image.open(io.BytesIO(object_storage.read(image.preview_key))) as preview:
        assert max(preview.size) == 1600


def test_images_cannot_be_removed_after_submission(client_for, inspector, asset, upload_file):
    client = client_for(inspector)
    inspection = _create(client, asset)
    image_id = client.post("/api/images/upload/", {"inspection": inspection["id"], "file": upload_file()}, format="multipart").json()["id"]
    client.post(f"/api/inspections/{inspection['id']}/submit/")
    assert client.delete(f"/api/images/{image_id}/").status_code == 409


def test_stalled_inspections_are_recovered(asset, inspector):
    stuck = InspectionLog.objects.create(structural_asset=asset, inspector=inspector, status=InspectionStatus.PROCESSING)
    InspectionLog.objects.filter(pk=stuck.pk).update(updated_at=timezone.now() - timedelta(hours=2))
    assert recover_stalled_inspections() == 1
    stuck.refresh_from_db()
    assert stuck.status == InspectionStatus.FAILED and "stalled" in stuck.error_message


def test_detection_review_requires_engineer(client_for, inspector, engineer, asset, cracked_upload):
    client = client_for(inspector)
    inspection = _create(client, asset)
    client.post("/api/images/upload/", {"inspection": inspection["id"], "file": cracked_upload()}, format="multipart")
    client.post(f"/api/inspections/{inspection['id']}/submit/")
    detection = client.get(f"/api/detections/?inspection={inspection['id']}").json()["results"][0]
    assert client.patch(f"/api/detections/{detection['id']}/", {"review_status": "REJECTED"}).status_code == 403
    reviewed = client_for(engineer).patch(f"/api/detections/{detection['id']}/", {"review_status": "CONFIRMED"})
    assert reviewed.status_code == 200 and reviewed.json()["review_status"] == "CONFIRMED"


def test_inspection_list_filters(client_for, viewer, asset, inspector):
    InspectionLog.objects.create(structural_asset=asset, inspector=inspector, status=InspectionStatus.FAILED)
    InspectionLog.objects.create(structural_asset=asset, inspector=inspector, status=InspectionStatus.COMPLETED, overall_health_score=80)
    client = client_for(viewer)
    assert client.get("/api/inspections/?status=FAILED").json()["count"] == 1
    assert client.get(f"/api/inspections/?asset={asset.pk}&ordering=-overall_health_score").json()["count"] == 2
    queue = client.get("/api/inspections/queue/").json()
    assert queue["counts"]["failed"] == 1
