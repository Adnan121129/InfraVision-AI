import pytest
from django.core.management import call_command

pytestmark = pytest.mark.django_db


@pytest.fixture
def seeded(db):
    call_command("seed_demo", "--seed", "7", verbosity=0)


def test_dashboard_payload(client_for, seeded):
    from apps.users.models import User

    client = client_for(User.objects.get(email="viewer@infravision.ai"))
    body = client.get("/api/dashboard/").json()
    kpis = body["kpis"]
    assert kpis["total_assets"] >= 50
    assert kpis["healthy_assets"] + kpis["at_risk_assets"] + kpis["critical_assets"] + kpis["uninspected_assets"] == kpis["total_assets"]
    assert len(body["health_trend"]) == 12
    assert body["model_status"]["is_demo"] is True
    assert body["demo_data"]["demo_inspections"] == body["demo_data"]["completed_inspections"]
    assert len(body["recent_inspections"]) == 8


def test_analytics_with_filters(client_for, seeded):
    from apps.users.models import User

    client = client_for(User.objects.get(email="engineer@infravision.ai"))
    body = client.get("/api/analytics/?asset_type=BRIDGE&severity=HIGH,CRITICAL").json()
    assert {d["severity"] for d in body["defects_by_severity"] if d["count"]} <= {"HIGH", "CRITICAL"}
    assert body["filters"]["asset_type"] == ["BRIDGE"]
    for key in ("health_trend", "defects_by_type", "inspections_per_month", "critical_incidents", "risk_distribution", "confidence_trend", "processing_time", "maintenance_trend"):
        assert key in body


def test_analytics_rejects_bad_ranges(client_for, viewer):
    response = client_for(viewer).get("/api/analytics/?date_from=2026-05-01&date_to=2026-01-01")
    assert response.status_code == 400


def test_seeded_risk_analysis_is_system_generated(client_for, seeded):
    from apps.assets.models import StructuralAsset
    from apps.users.models import User

    client = client_for(User.objects.get(email="viewer@infravision.ai"))
    asset = StructuralAsset.objects.order_by("current_health_score").first()
    body = client.get(f"/api/assets/{asset.pk}/risk-analysis/").json()
    assert body["has_data"] is True and body["generated_by"] == "system"
    assert body["priority"]["code"] in {"P1", "P2", "P3", "P4"}
    history = client.get(f"/api/assets/{asset.pk}/health-history/").json()
    assert history == sorted(history, key=lambda r: r["inspection_date"])


def test_seed_is_idempotent(seeded):
    from apps.assets.models import StructuralAsset

    before = StructuralAsset.objects.count()
    call_command("seed_demo", verbosity=0)
    assert StructuralAsset.objects.count() == before


def test_meta_and_health(api_client, client_for, viewer):
    assert api_client.get("/api/health/").json()["status"] == "ok"
    meta = client_for(viewer).get("/api/meta/").json()
    assert {"asset_types", "defect_types", "upload_limits"} <= meta.keys()


def test_settings_admin_only(client_for, viewer, admin):
    assert client_for(viewer).patch("/api/settings/", {"healthy_threshold": 80}).status_code == 403
    client = client_for(admin)
    assert client.patch("/api/settings/", {"critical_threshold": 90}).status_code == 400
    assert client.patch("/api/settings/", {"healthy_threshold": 80}).json()["healthy_threshold"] == 80
