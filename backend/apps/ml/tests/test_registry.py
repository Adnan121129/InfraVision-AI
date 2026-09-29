import pytest

from apps.ml.models import MLModel, ModelStatus
from apps.ml.services import register_serving_model

pytestmark = pytest.mark.django_db


class _Info:
    def __init__(self, name, version, is_demo, metrics=None):
        self.name = name
        self.version = version
        self.framework = "opencv" if is_demo else "pytorch"
        self.architecture = "heuristics" if is_demo else "resnet50"
        self.description = ""
        self.is_demo = is_demo
        self.classes = ("crack", "no_defect")
        self.input_size = None if is_demo else 224
        self.artifact_uri = "" if is_demo else "/models/model.pt"
        self.training_dataset = "" if is_demo else "SDNET2018"
        self.metrics = metrics or {}


def test_registering_a_production_model_retires_the_demo_model():
    demo = register_serving_model(_Info("InfraVision Demo Detector", "0.4.0-demo", True))
    prod = register_serving_model(_Info("CrackNet", "1.0.0", False, {"accuracy": 0.93, "f1": 0.9}))
    demo.refresh_from_db()
    assert prod.status == ModelStatus.ACTIVE and prod.framework == "PYTORCH" and prod.accuracy == 0.93
    assert demo.status == ModelStatus.INACTIVE
    # re-registering (worker restart) upserts instead of duplicating
    register_serving_model(_Info("CrackNet", "1.0.0", False))
    assert MLModel.objects.filter(model_name="CrackNet").count() == 1


def test_active_model_endpoint_and_admin_only_edits(client_for, viewer, admin):
    model = register_serving_model(_Info("InfraVision Demo Detector", "0.4.0-demo", True))
    body = client_for(viewer).get("/api/models/active/").json()
    assert body["is_demo"] is True and body["accuracy"] is None
    assert client_for(viewer).patch(f"/api/models/{model.pk}/", {"description": "x"}).status_code == 403
    assert client_for(admin).patch(f"/api/models/{model.pk}/", {"description": "Heuristic baseline"}).json()["description"] == "Heuristic baseline"
