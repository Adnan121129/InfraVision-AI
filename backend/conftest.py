"""Shared pytest fixtures for the backend test-suite."""

import io
import sys
from pathlib import Path

import pytest

ML_PACKAGE = Path(__file__).resolve().parent.parent / "ml-worker"
if ML_PACKAGE.exists() and str(ML_PACKAGE) not in sys.path:
    sys.path.insert(0, str(ML_PACKAGE))


@pytest.fixture
def api_client():
    from rest_framework.test import APIClient

    return APIClient()


@pytest.fixture
def make_user(db):
    from apps.users.models import User

    counter = {"n": 0}

    def factory(role="VIEWER", **extra):
        counter["n"] += 1
        email = extra.pop("email", f"user{counter['n']}-{role.lower()}@example.com")
        return User.objects.create_user(email=email, password="Str0ng-Passw0rd!", role=role, first_name="Test", last_name=role.title(), **extra)

    return factory


@pytest.fixture
def admin(make_user):
    return make_user("ADMINISTRATOR")


@pytest.fixture
def engineer(make_user):
    return make_user("ENGINEER")


@pytest.fixture
def inspector(make_user):
    return make_user("INSPECTOR")


@pytest.fixture
def viewer(make_user):
    return make_user("VIEWER")


@pytest.fixture
def client_for(api_client):
    def factory(user):
        api_client.force_authenticate(user)
        return api_client

    return factory


@pytest.fixture
def asset(db, engineer):
    from apps.assets.models import StructuralAsset

    return StructuralAsset.objects.create(
        asset_name="Cedar Creek Bridge",
        asset_type="BRIDGE",
        material_type="REINFORCED_CONCRETE",
        location="Seattle, WA",
        region="Puget Sound",
        latitude=47.6,
        longitude=-122.3,
        created_by=engineer,
    )


def jpeg_bytes(width=640, height=480, color=(150, 150, 150), fmt="JPEG") -> bytes:
    from PIL import Image

    buffer = io.BytesIO()
    Image.new("RGB", (width, height), color).save(buffer, format=fmt)
    return buffer.getvalue()


def cracked_jpeg() -> bytes:
    """A concrete-like surface with a long dark crack (detected by the demo model)."""
    import numpy as np
    from PIL import Image, ImageDraw

    rng = np.random.default_rng(3)
    gray = np.clip(rng.normal(150, 8, (768, 1024)), 0, 255).astype("uint8")
    image = Image.fromarray(gray).convert("RGB")
    draw = ImageDraw.Draw(image)
    points = [(100 + i * 12, 300 + int(40 * np.sin(i / 5))) for i in range(60)]
    draw.line(points, fill=(35, 35, 35), width=4)
    buffer = io.BytesIO()
    image.save(buffer, format="JPEG", quality=92)
    return buffer.getvalue()


@pytest.fixture
def upload_file():
    from django.core.files.uploadedfile import SimpleUploadedFile

    def factory(name="inspection.jpg", content=None, content_type="image/jpeg"):
        return SimpleUploadedFile(name, content if content is not None else jpeg_bytes(), content_type=content_type)

    return factory


@pytest.fixture
def cracked_upload(upload_file):
    return lambda: upload_file("crack.jpg", cracked_jpeg())
