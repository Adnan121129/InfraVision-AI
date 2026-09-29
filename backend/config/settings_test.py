"""Settings for the automated test-suite: isolated, fast and dependency-free."""

import os
import tempfile

os.environ.setdefault("DJANGO_SECRET_KEY", "test-only-secret-key-not-used-anywhere-else")
os.environ.setdefault("DJANGO_DEBUG", "false")
os.environ.setdefault("DJANGO_SECURE_SSL_REDIRECT", "false")
os.environ.setdefault("DATABASE_URL", os.environ.get("TEST_DATABASE_URL", "sqlite:///:memory:"))
os.environ.setdefault("USE_S3", "false")
os.environ.setdefault("INFERENCE_MODE", "demo")

from .settings import *  # noqa: E402,F401,F403

MEDIA_ROOT = tempfile.mkdtemp(prefix="infravision-test-media-")
STATIC_ROOT = tempfile.mkdtemp(prefix="infravision-test-static-")
PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]
CACHES = {"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"}}
CHANNEL_LAYERS = {"default": {"BACKEND": "channels.layers.InMemoryChannelLayer"}}
CELERY_TASK_ALWAYS_EAGER = True
CELERY_TASK_EAGER_PROPAGATES = True
CELERY_BROKER_URL = "memory://"
CELERY_RESULT_BACKEND = "cache+memory://"
STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    "staticfiles": {"BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage"},
}
REST_FRAMEWORK = {**REST_FRAMEWORK, "DEFAULT_THROTTLE_CLASSES": (), "DEFAULT_RENDERER_CLASSES": ("rest_framework.renderers.JSONRenderer",)}  # noqa: F405
LOGGING = {"version": 1, "disable_existing_loggers": False, "root": {"level": "WARNING"}}
