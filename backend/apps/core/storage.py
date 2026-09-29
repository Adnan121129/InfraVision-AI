"""Object storage abstraction for inspection imagery.

In Docker/production the default storage is S3 (MinIO locally). In unit tests
and bare-metal development the local filesystem is used. Application code
only talks to :class:`ObjectStorage`, never to boto3 or the filesystem.
"""

from __future__ import annotations

import logging
from functools import cached_property

from django.conf import settings
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from storages.backends.s3 import S3Storage
from storages.utils import clean_name

from .exceptions import StorageUnavailable

logger = logging.getLogger(__name__)


class InspectionS3Storage(S3Storage):
    """S3 storage that signs browser-facing URLs against a public endpoint.

    Inside Docker the API reaches MinIO at ``http://minio:9000`` while the
    browser reaches it at ``http://localhost:9000``. SigV4 signatures cover
    the Host header, so URLs must be signed for the host the browser uses.
    """

    @cached_property
    def _public_client(self):
        public_endpoint = settings.AWS_S3_PUBLIC_ENDPOINT_URL
        if not public_endpoint or public_endpoint == settings.AWS_S3_ENDPOINT_URL:
            return self.connection.meta.client
        import boto3
        from botocore.config import Config

        return boto3.client(
            "s3",
            endpoint_url=public_endpoint,
            region_name=settings.AWS_S3_REGION_NAME,
            aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
            aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
            config=Config(signature_version="s3v4", s3={"addressing_style": settings.AWS_S3_ADDRESSING_STYLE}),
        )

    def url(self, name, parameters=None, expire=None, http_method=None):
        params = dict(parameters or {})
        params["Bucket"] = self.bucket_name
        params["Key"] = self._normalize_name(clean_name(name))
        return self._public_client.generate_presigned_url(
            "get_object", Params=params, ExpiresIn=expire or self.querystring_expire
        )


class ObjectStorage:
    """Thin facade over Django's configured default storage."""

    def __init__(self, storage=None):
        self._storage = storage

    @property
    def backend(self):
        return self._storage or default_storage

    @property
    def is_s3(self) -> bool:
        return isinstance(self.backend, S3Storage)

    def save(self, key: str, content: bytes, content_type: str | None = None) -> str:
        try:
            file = ContentFile(content)
            if content_type:
                file.content_type = content_type
            return self.backend.save(key, file)
        except Exception as exc:  # boto/botocore/OSError all surface here
            logger.exception("Failed to store object %s", key)
            raise StorageUnavailable() from exc

    def read(self, key: str) -> bytes:
        try:
            with self.backend.open(key, "rb") as handle:
                return handle.read()
        except FileNotFoundError:
            raise
        except Exception as exc:
            logger.exception("Failed to read object %s", key)
            raise StorageUnavailable() from exc

    def delete(self, key: str | None) -> None:
        if not key:
            return
        try:
            self.backend.delete(key)
        except Exception:  # deletion failures must never break the caller
            logger.warning("Could not delete object %s", key, exc_info=True)

    def exists(self, key: str) -> bool:
        try:
            return self.backend.exists(key)
        except Exception as exc:
            raise StorageUnavailable() from exc

    def url(self, key: str | None, request=None) -> str | None:
        if not key:
            return None
        try:
            url = self.backend.url(key)
        except Exception:
            logger.warning("Could not build URL for %s", key, exc_info=True)
            return None
        if request is not None and url.startswith("/"):
            return request.build_absolute_uri(url)
        return url

    def uri(self, key: str) -> str:
        """Canonical, non-expiring location of an object (stored in the database)."""
        if self.is_s3:
            return f"s3://{settings.AWS_STORAGE_BUCKET_NAME}/{key}"
        return f"file://{settings.MEDIA_ROOT}/{key}"

    def healthcheck(self) -> bool:
        try:
            if self.is_s3:
                self.backend.connection.meta.client.head_bucket(Bucket=self.backend.bucket_name)
            else:
                self.backend.exists(".")
            return True
        except Exception:
            logger.warning("Storage health check failed", exc_info=True)
            return False


def ensure_bucket() -> None:
    """Create the configured bucket if it does not exist (MinIO / first boot)."""
    storage = ObjectStorage()
    if not storage.is_s3:
        return
    client = storage.backend.connection.meta.client
    bucket = storage.backend.bucket_name
    try:
        client.head_bucket(Bucket=bucket)
    except Exception:
        logger.info("Creating object storage bucket %s", bucket)
        client.create_bucket(Bucket=bucket)


object_storage = ObjectStorage()
