import pytest

from apps.alerts.models import AlertStatus, MaintenanceAlert
from apps.alerts.services import flag_overdue_assets

pytestmark = pytest.mark.django_db


@pytest.fixture
def alert(asset):
    return MaintenanceAlert.objects.create(structural_asset=asset, title="Critical spalling", severity="CRITICAL")


def test_inspector_can_acknowledge_but_not_resolve(client_for, inspector, alert):
    client = client_for(inspector)
    assert client.patch(f"/api/alerts/{alert.pk}/", {"status": "INVESTIGATING"}).json()["status"] == "INVESTIGATING"
    assert client.patch(f"/api/alerts/{alert.pk}/", {"status": "RESOLVED"}).status_code == 403


def test_engineer_resolves_with_notes_and_asset_risk_updates(client_for, engineer, alert, asset):
    from apps.assets.services import refresh_asset_health

    refresh_asset_health(asset)
    asset.refresh_from_db()
    assert asset.risk_level == "CRITICAL"  # open critical alert drives risk
    response = client_for(engineer).patch(
        f"/api/alerts/{alert.pk}/", {"status": "RESOLVED", "resolution_notes": "Patched with repair mortar", "assigned_to": engineer.pk}
    )
    body = response.json()
    assert body["status"] == "RESOLVED" and body["resolved_at"] and body["resolution_notes"]
    assert body["assigned_to_detail"]["id"] == engineer.pk
    asset.refresh_from_db()
    assert asset.risk_level == "LOW"


def test_viewer_cannot_update_alerts(client_for, viewer, alert):
    assert client_for(viewer).patch(f"/api/alerts/{alert.pk}/", {"status": "INVESTIGATING"}).status_code == 403


def test_filters_and_summary(client_for, viewer, alert, asset):
    MaintenanceAlert.objects.create(structural_asset=asset, title="Rust", severity="LOW", status=AlertStatus.RESOLVED)
    client = client_for(viewer)
    assert client.get("/api/alerts/?active=true").json()["count"] == 1
    assert client.get("/api/alerts/?severity=LOW").json()["count"] == 1
    assert client.get("/api/alerts/?search=spalling").json()["count"] == 1
    summary = client.get("/api/alerts/summary/").json()
    assert summary["critical_active"] == 1 and summary["resolved"] == 1


def test_overdue_assets_are_flagged_once(asset):
    from datetime import timedelta

    from django.utils import timezone

    asset.last_inspection_at = timezone.now() - timedelta(days=400)
    asset.save()
    assert flag_overdue_assets() == 1
    assert flag_overdue_assets() == 0
