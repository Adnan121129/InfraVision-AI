import pytest
from django.test import override_settings

pytestmark = pytest.mark.django_db


def test_login_returns_tokens_and_user(api_client, engineer):
    response = api_client.post("/api/auth/login/", {"email": engineer.email.upper(), "password": "Str0ng-Passw0rd!"})
    assert response.status_code == 200
    body = response.json()
    assert {"access", "refresh", "user"} <= body.keys()
    assert body["user"]["role"] == "ENGINEER"


def test_invalid_login_has_clear_message(api_client, engineer):
    response = api_client.post("/api/auth/login/", {"email": engineer.email, "password": "wrong"})
    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid email or password."


def test_protected_routes_require_authentication(api_client):
    assert api_client.get("/api/assets/").status_code == 401


def test_refresh_rotates_and_logout_blacklists(api_client, viewer):
    tokens = api_client.post("/api/auth/login/", {"email": viewer.email, "password": "Str0ng-Passw0rd!"}).json()
    refreshed = api_client.post("/api/auth/refresh/", {"refresh": tokens["refresh"]})
    assert refreshed.status_code == 200 and "access" in refreshed.json()
    new_refresh = refreshed.json()["refresh"]
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {refreshed.json()['access']}")
    assert api_client.post("/api/auth/logout/", {"refresh": new_refresh}).status_code == 205
    assert api_client.post("/api/auth/refresh/", {"refresh": new_refresh}).status_code == 401
    # the rotated-away token is blacklisted too
    assert api_client.post("/api/auth/refresh/", {"refresh": tokens["refresh"]}).status_code == 401


def test_registration_creates_viewer(api_client):
    response = api_client.post(
        "/api/auth/register/",
        {"email": "New.User@Example.com", "password": "Very-Secure-Pass-9", "first_name": "New", "last_name": "User"},
    )
    assert response.status_code == 201
    assert response.json()["user"]["role"] == "VIEWER"
    assert response.json()["user"]["email"] == "new.user@example.com"


def test_registration_rejects_weak_password(api_client):
    response = api_client.post("/api/auth/register/", {"email": "a@example.com", "password": "12345678"})
    assert response.status_code == 400
    assert "password" in response.json()["errors"]


@override_settings(ALLOW_SELF_REGISTRATION=False)
def test_registration_can_be_disabled(api_client):
    response = api_client.post("/api/auth/register/", {"email": "b@example.com", "password": "Very-Secure-Pass-9"})
    assert response.status_code == 400


def test_me_and_password_change(client_for, inspector):
    client = client_for(inspector)
    assert client.get("/api/auth/me/").json()["email"] == inspector.email
    # role cannot be self-escalated
    client.patch("/api/auth/me/", {"role": "ADMINISTRATOR", "job_title": "Lead"})
    inspector.refresh_from_db()
    assert inspector.role == "INSPECTOR" and inspector.job_title == "Lead"
    bad = client.post("/api/auth/change-password/", {"current_password": "nope", "new_password": "Another-Strong-1"})
    assert bad.status_code == 400
    ok = client.post("/api/auth/change-password/", {"current_password": "Str0ng-Passw0rd!", "new_password": "Another-Strong-1"})
    assert ok.status_code == 204


def test_user_admin_is_admin_only(client_for, admin, engineer):
    assert client_for(engineer).get("/api/users/").status_code == 403
    client = client_for(admin)
    created = client.post(
        "/api/users/",
        {"email": "field@example.com", "username": "field", "password": "Field-Inspector-77", "role": "INSPECTOR", "first_name": "F"},
    )
    assert created.status_code == 201, created.json()
    user_id = created.json()["id"]
    assert client.patch(f"/api/users/{user_id}/", {"role": "ENGINEER"}).json()["role"] == "ENGINEER"
    assert client.delete(f"/api/users/{user_id}/").status_code == 204
    assert client.get(f"/api/users/{user_id}/").json()["is_active"] is False


def test_admin_cannot_lock_themselves_out(client_for, admin):
    client = client_for(admin)
    assert client.patch(f"/api/users/{admin.pk}/", {"role": "VIEWER"}).status_code == 400
    assert client.delete(f"/api/users/{admin.pk}/").status_code == 400
