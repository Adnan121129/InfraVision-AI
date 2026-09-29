import pytest
from django.test import override_settings

from apps.core.storage import InspectionS3Storage


@override_settings(
    AWS_S3_ENDPOINT_URL="http://minio:9000",
    AWS_S3_PUBLIC_ENDPOINT_URL="http://localhost:9000",
    AWS_ACCESS_KEY_ID="test-key",
    AWS_SECRET_ACCESS_KEY="test-secret",
    AWS_STORAGE_BUCKET_NAME="infravision-inspections",
)
def test_presigned_urls_use_the_public_endpoint():
    storage = InspectionS3Storage(
        endpoint_url="http://minio:9000", access_key="test-key", secret_key="test-secret", bucket_name="infravision-inspections"
    )
    url = storage.url("inspections/2026/09/INS-1001/abc.jpg")
    assert url.startswith("http://localhost:9000/infravision-inspections/inspections/2026/09/INS-1001/abc.jpg?")
    assert "X-Amz-Signature=" in url


@pytest.mark.django_db
def test_filesystem_storage_round_trip():
    from apps.core.storage import object_storage

    key = object_storage.save("tests/sample.bin", b"payload", "application/octet-stream")
    assert object_storage.read(key) == b"payload"
    assert object_storage.uri(key).startswith("file://")
    object_storage.delete(key)
    assert not object_storage.exists(key)
