import pytest

from apps.assets.models import StructuralAsset

pytestmark = pytest.mark.django_db

PAYLOAD = {
    "asset_name": "Harbor Point Viaduct",
    "asset_type": "BRIDGE",
    "material_type": "PRESTRESSED_CONCRETE",
    "location": "Oakland, CA",
    "latitude": "37.800000",
    "longitude": "-122.220000",
    "installation_date": "1988-05-01",
}


def test_viewer_is_read_only(client_for, viewer, asset):
    client = client_for(viewer)
    assert client.get("/api/assets/").status_code == 200
    assert client.post("/api/assets/", PAYLOAD).status_code == 403
    assert client.patch(f"/api/assets/{asset.pk}/", {"asset_name": "x"}).status_code == 403


def test_engineer_creates_and_updates_asset(client_for, engineer):
    client = client_for(engineer)
    response = client.post("/api/assets/", PAYLOAD)
    assert response.status_code == 201, response.json()
    body = response.json()
    assert body["asset_code"].startswith("AST-")
    assert body["risk_level"] == "LOW" and body["current_health_score"] is None
    updated = client.patch(f"/api/assets/{body['id']}/", {"description": "Twin-cell box girder"})
    assert updated.json()["description"] == "Twin-cell box girder"


def test_coordinates_must_come_in_pairs(client_for, engineer):
    response = client_for(engineer).post("/api/assets/", {**PAYLOAD, "longitude": None})
    assert response.status_code == 400


def test_search_filter_and_ordering(client_for, viewer, engineer):
    StructuralAsset.objects.create(asset_name="North Ridge Tunnel", asset_type="TUNNEL", material_type="MASONRY", location="Portland", current_health_score=40, risk_level="CRITICAL")
    StructuralAsset.objects.create(asset_name="Route 9 Segment", asset_type="ROAD", material_type="ASPHALT", location="Seattle", current_health_score=90)
    client = client_for(viewer)
    assert [a["asset_name"] for a in client.get("/api/assets/?search=ridge").json()["results"]] == ["North Ridge Tunnel"]
    assert client.get("/api/assets/?asset_type=ROAD&asset_type=TUNNEL").json()["count"] == 2
    assert client.get("/api/assets/?risk_level=CRITICAL").json()["count"] == 1
    ordered = client.get("/api/assets/?ordering=current_health_score").json()["results"]
    assert ordered[0]["asset_name"] == "North Ridge Tunnel"
    page = client.get("/api/assets/?page_size=1").json()
    assert page["total_pages"] == 2 and len(page["results"]) == 1


def test_archive_hides_asset_and_only_admin_deletes(client_for, engineer, admin, asset):
    client = client_for(engineer)
    assert client.post(f"/api/assets/{asset.pk}/archive/").json()["is_archived"] is True
    assert client.get("/api/assets/").json()["count"] == 0
    assert client.get("/api/assets/?archived=true").json()["count"] == 1
    assert client.delete(f"/api/assets/{asset.pk}/").status_code == 403
    assert client_for(admin).delete(f"/api/assets/{asset.pk}/").status_code == 204


def test_map_and_options_endpoints(client_for, viewer, asset):
    client = client_for(viewer)
    markers = client.get("/api/assets/map/").json()
    assert markers[0]["asset_name"] == asset.asset_name and "open_alerts_count" in markers[0]
    assert client.get("/api/assets/options/").json()[0]["id"] == asset.pk


def test_missing_asset_returns_friendly_404(client_for, viewer):
    response = client_for(viewer).get("/api/assets/99999/")
    assert response.status_code == 404
    assert response.json()["detail"] == "The requested resource was not found."


def test_risk_analysis_without_history(client_for, viewer, asset):
    body = client_for(viewer).get(f"/api/assets/{asset.pk}/risk-analysis/").json()
    assert body["generated_by"] == "system"
    assert body["has_data"] is False
    assert "qualified engineer" in body["disclaimer"]
