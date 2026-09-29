"""Django settings for the InfraVision AI platform.

Every deployment-specific value is read from the environment. See the
repository-level ``.env.example`` for the full list of variables.
"""

from __future__ import annotations

import logging
from datetime import timedelta
from pathlib import Path

import dj_database_url
from celery.schedules import crontab

from .env import env_bool, env_float, env_int, env_list, env_str

BASE_DIR = Path(__file__).resolve().parent.parent

# ---------------------------------------------------------------------------
# Core
# ---------------------------------------------------------------------------
DEBUG = env_bool("DJANGO_DEBUG", False)

_secret_key = env_str("DJANGO_SECRET_KEY")
if not _secret_key:
    if not DEBUG:
        from django.core.exceptions import ImproperlyConfigured

        raise ImproperlyConfigured("DJANGO_SECRET_KEY must be set when DJANGO_DEBUG is false.")
    # Development-only fallback so `manage.py` works out of the box. It is
    # never used when DEBUG is off.
    _secret_key = "django-insecure-development-only-key-do-not-use-in-production"
    logging.getLogger(__name__).warning("DJANGO_SECRET_KEY not set; using an insecure development key.")
SECRET_KEY = _secret_key

ALLOWED_HOSTS = env_list("DJANGO_ALLOWED_HOSTS", ["localhost", "127.0.0.1", "backend"])
CSRF_TRUSTED_ORIGINS = env_list("DJANGO_CSRF_TRUSTED_ORIGINS", ["http://localhost:5173", "http://localhost:8080"])

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    # Third party
    "rest_framework",
    "rest_framework_simplejwt",
    "rest_framework_simplejwt.token_blacklist",
    "corsheaders",
    "django_filters",
    "drf_spectacular",
    "channels",
    # Local apps
    "apps.core",
    "apps.users",
    "apps.assets",
    "apps.ml",
    "apps.inspections",
    "apps.alerts",
    "apps.analytics",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
    "apps.core.middleware.RequestLoggingMiddleware",
]

ROOT_URLCONF = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

AUTH_USER_MODEL = "users.User"
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# ---------------------------------------------------------------------------
# Database (PostgreSQL)
# ---------------------------------------------------------------------------
_default_db_url = "postgres://{user}:{password}@{host}:{port}/{name}".format(
    user=env_str("POSTGRES_USER", "infravision"),
    password=env_str("POSTGRES_PASSWORD", ""),
    host=env_str("POSTGRES_HOST", "localhost"),
    port=env_str("POSTGRES_PORT", "5432"),
    name=env_str("POSTGRES_DB", "infravision"),
)
DATABASES = {
    "default": dj_database_url.parse(
        env_str("DATABASE_URL", _default_db_url),
        conn_max_age=env_int("DB_CONN_MAX_AGE", 60),
        conn_health_checks=True,
    )
}

# ---------------------------------------------------------------------------
# Passwords & authentication
# ---------------------------------------------------------------------------
AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator", "OPTIONS": {"min_length": 10}},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

PASSWORD_HASHERS = [
    "django.contrib.auth.hashers.Argon2PasswordHasher",
    "django.contrib.auth.hashers.PBKDF2PasswordHasher",
    "django.contrib.auth.hashers.PBKDF2SHA1PasswordHasher",
    "django.contrib.auth.hashers.ScryptPasswordHasher",
]

ALLOW_SELF_REGISTRATION = env_bool("ALLOW_SELF_REGISTRATION", True)

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": ("rest_framework_simplejwt.authentication.JWTAuthentication",),
    "DEFAULT_PERMISSION_CLASSES": ("rest_framework.permissions.IsAuthenticated",),
    "DEFAULT_PAGINATION_CLASS": "apps.core.pagination.StandardResultsSetPagination",
    "PAGE_SIZE": 20,
    "DEFAULT_FILTER_BACKENDS": (
        "django_filters.rest_framework.DjangoFilterBackend",
        "rest_framework.filters.SearchFilter",
        "rest_framework.filters.OrderingFilter",
    ),
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    "EXCEPTION_HANDLER": "apps.core.exceptions.api_exception_handler",
    "DEFAULT_THROTTLE_CLASSES": (
        "rest_framework.throttling.AnonRateThrottle",
        "rest_framework.throttling.UserRateThrottle",
    ),
    "DEFAULT_THROTTLE_RATES": {
        "anon": env_str("THROTTLE_ANON_RATE", "60/minute"),
        "user": env_str("THROTTLE_USER_RATE", "1200/minute"),
        "auth": env_str("THROTTLE_AUTH_RATE", "10/minute"),
        "upload": env_str("THROTTLE_UPLOAD_RATE", "240/hour"),
    },
    "DEFAULT_RENDERER_CLASSES": ("rest_framework.renderers.JSONRenderer",)
    if not DEBUG
    else ("rest_framework.renderers.JSONRenderer", "rest_framework.renderers.BrowsableAPIRenderer"),
    "TEST_REQUEST_DEFAULT_FORMAT": "json",
}

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=env_int("JWT_ACCESS_TOKEN_MINUTES", 15)),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=env_int("JWT_REFRESH_TOKEN_DAYS", 7)),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
    "UPDATE_LAST_LOGIN": True,
    "ALGORITHM": "HS256",
    "SIGNING_KEY": env_str("JWT_SIGNING_KEY", SECRET_KEY),
    "AUTH_HEADER_TYPES": ("Bearer",),
    "USER_ID_FIELD": "id",
    "USER_ID_CLAIM": "user_id",
}

SPECTACULAR_SETTINGS = {
    "TITLE": "InfraVision AI API",
    "DESCRIPTION": "Predictive infrastructure maintenance platform: assets, AI inspections, alerts and analytics.",
    "VERSION": "1.0.0",
    "SERVE_INCLUDE_SCHEMA": False,
    "COMPONENT_SPLIT_REQUEST": True,
    "SCHEMA_PATH_PREFIX": "/api",
    "ENUM_NAME_OVERRIDES": {
        "LevelEnum": "apps.core.choices.Severity",
        "InspectionStatusEnum": "apps.inspections.models.InspectionStatus",
        "AlertStatusEnum": "apps.alerts.models.AlertStatus",
        "ModelStatusEnum": "apps.ml.models.ModelStatus",
    },
}

# ---------------------------------------------------------------------------
# CORS
# ---------------------------------------------------------------------------
CORS_ALLOWED_ORIGINS = env_list("CORS_ALLOWED_ORIGINS", ["http://localhost:5173", "http://localhost:8080"])
CORS_ALLOW_CREDENTIALS = False

# ---------------------------------------------------------------------------
# Internationalisation
# ---------------------------------------------------------------------------
LANGUAGE_CODE = "en-us"
TIME_ZONE = env_str("DJANGO_TIME_ZONE", "UTC")
USE_I18N = True
USE_TZ = True

# ---------------------------------------------------------------------------
# Static & media files
# ---------------------------------------------------------------------------
STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
MEDIA_URL = "/media/"
MEDIA_ROOT = Path(env_str("MEDIA_ROOT", str(BASE_DIR / "media")))

USE_S3 = env_bool("USE_S3", False)
AWS_STORAGE_BUCKET_NAME = env_str("AWS_STORAGE_BUCKET_NAME", "infravision-inspections")
AWS_S3_ENDPOINT_URL = env_str("AWS_S3_ENDPOINT_URL")  # e.g. http://minio:9000 for MinIO
# Endpoint used when signing URLs handed to browsers. For MinIO in Docker the
# internal hostname (minio:9000) is not reachable from the browser.
AWS_S3_PUBLIC_ENDPOINT_URL = env_str("AWS_S3_PUBLIC_ENDPOINT_URL", AWS_S3_ENDPOINT_URL)
AWS_S3_REGION_NAME = env_str("AWS_S3_REGION_NAME", "us-east-1")
AWS_ACCESS_KEY_ID = env_str("AWS_ACCESS_KEY_ID")
AWS_SECRET_ACCESS_KEY = env_str("AWS_SECRET_ACCESS_KEY")
AWS_S3_SIGNATURE_VERSION = "s3v4"
AWS_S3_ADDRESSING_STYLE = env_str("AWS_S3_ADDRESSING_STYLE", "path")
AWS_DEFAULT_ACL = None
AWS_QUERYSTRING_AUTH = True
AWS_QUERYSTRING_EXPIRE = env_int("AWS_QUERYSTRING_EXPIRE", 3600)
AWS_S3_FILE_OVERWRITE = False
AWS_AUTO_CREATE_BUCKET = env_bool("AWS_AUTO_CREATE_BUCKET", True)

STORAGES = {
    "default": {
        "BACKEND": "apps.core.storage.InspectionS3Storage"
        if USE_S3
        else "django.core.files.storage.FileSystemStorage",
    },
    "staticfiles": {"BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage"},
}

# Upload validation
MAX_IMAGE_UPLOAD_MB = env_int("MAX_IMAGE_UPLOAD_MB", 25)
MAX_IMAGE_PIXELS = env_int("MAX_IMAGE_PIXELS", 80_000_000)
MAX_IMAGES_PER_INSPECTION = env_int("MAX_IMAGES_PER_INSPECTION", 20)
ALLOWED_IMAGE_EXTENSIONS = ("jpg", "jpeg", "png", "webp")
DATA_UPLOAD_MAX_MEMORY_SIZE = 5 * 1024 * 1024
FILE_UPLOAD_MAX_MEMORY_SIZE = 5 * 1024 * 1024
IMAGE_THUMBNAIL_SIZE = env_int("IMAGE_THUMBNAIL_SIZE", 360)
IMAGE_PREVIEW_SIZE = env_int("IMAGE_PREVIEW_SIZE", 1600)

# ---------------------------------------------------------------------------
# Redis, cache, Channels
# ---------------------------------------------------------------------------
REDIS_URL = env_str("REDIS_URL", "redis://localhost:6379/0")
CACHE_REDIS_URL = env_str("CACHE_REDIS_URL", REDIS_URL.rsplit("/", 1)[0] + "/2")

CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.redis.RedisCache",
        "LOCATION": CACHE_REDIS_URL,
        "KEY_PREFIX": "infravision",
        "TIMEOUT": 300,
    }
}

CHANNEL_LAYERS = {
    "default": {
        "BACKEND": "channels_redis.core.RedisChannelLayer",
        "CONFIG": {"hosts": [env_str("CHANNELS_REDIS_URL", REDIS_URL.rsplit("/", 1)[0] + "/3")]},
    }
}

DASHBOARD_CACHE_SECONDS = env_int("DASHBOARD_CACHE_SECONDS", 20)

# ---------------------------------------------------------------------------
# Celery
# ---------------------------------------------------------------------------
CELERY_BROKER_URL = env_str("CELERY_BROKER_URL", REDIS_URL)
CELERY_RESULT_BACKEND = env_str("CELERY_RESULT_BACKEND", REDIS_URL.rsplit("/", 1)[0] + "/1")
CELERY_ACCEPT_CONTENT = ["json"]
CELERY_TASK_SERIALIZER = "json"
CELERY_RESULT_SERIALIZER = "json"
CELERY_RESULT_EXPIRES = 60 * 60 * 24
CELERY_TIMEZONE = TIME_ZONE
CELERY_TASK_TRACK_STARTED = True
CELERY_TASK_ACKS_LATE = True
CELERY_TASK_REJECT_ON_WORKER_LOST = True
CELERY_WORKER_PREFETCH_MULTIPLIER = 1
CELERY_TASK_DEFAULT_QUEUE = "default"
CELERY_TASK_ROUTES = {
    "inspections.run_inference": {"queue": "inference"},
}
CELERY_TASK_ALWAYS_EAGER = env_bool("CELERY_TASK_ALWAYS_EAGER", False)
CELERY_BROKER_CONNECTION_RETRY_ON_STARTUP = True
CELERY_BEAT_SCHEDULE = {
    "recover-stalled-inspections": {
        "task": "inspections.recover_stalled_inspections",
        "schedule": timedelta(minutes=10),
    },
    "flag-overdue-inspections": {
        "task": "alerts.flag_overdue_inspections",
        "schedule": crontab(hour=6, minute=15),
    },
}

INFERENCE_SOFT_TIME_LIMIT = env_int("INFERENCE_SOFT_TIME_LIMIT", 600)
INFERENCE_STALL_MINUTES = env_int("INFERENCE_STALL_MINUTES", 30)
INFERENCE_MAX_RETRIES = env_int("INFERENCE_MAX_RETRIES", 2)

# Health thresholds used when the platform configuration row is missing.
DEFAULT_HEALTHY_THRESHOLD = env_float("DEFAULT_HEALTHY_THRESHOLD", 75.0)
DEFAULT_CRITICAL_THRESHOLD = env_float("DEFAULT_CRITICAL_THRESHOLD", 50.0)

# ---------------------------------------------------------------------------
# Security hardening (applies whenever DEBUG is off)
# ---------------------------------------------------------------------------
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_REFERRER_POLICY = "strict-origin-when-cross-origin"
SECURE_CROSS_ORIGIN_OPENER_POLICY = "same-origin"
X_FRAME_OPTIONS = "DENY"
SESSION_COOKIE_HTTPONLY = True
CSRF_COOKIE_HTTPONLY = True

if not DEBUG:
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
    SECURE_SSL_REDIRECT = env_bool("DJANGO_SECURE_SSL_REDIRECT", True)
    SECURE_REDIRECT_EXEMPT = [r"^api/health/$"]
    SESSION_COOKIE_SECURE = env_bool("DJANGO_SECURE_COOKIES", True)
    CSRF_COOKIE_SECURE = env_bool("DJANGO_SECURE_COOKIES", True)
    SECURE_HSTS_SECONDS = env_int("DJANGO_HSTS_SECONDS", 60 * 60 * 24 * 30)
    SECURE_HSTS_INCLUDE_SUBDOMAINS = env_bool("DJANGO_HSTS_INCLUDE_SUBDOMAINS", True)
    SECURE_HSTS_PRELOAD = env_bool("DJANGO_HSTS_PRELOAD", False)

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
LOG_LEVEL = env_str("LOG_LEVEL", "INFO")
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "standard": {"format": "%(asctime)s %(levelname)-8s [%(name)s] %(message)s"},
    },
    "handlers": {
        "console": {"class": "logging.StreamHandler", "formatter": "standard"},
    },
    "root": {"handlers": ["console"], "level": LOG_LEVEL},
    "loggers": {
        "django": {"handlers": ["console"], "level": env_str("DJANGO_LOG_LEVEL", "INFO"), "propagate": False},
        "django.request": {"handlers": ["console"], "level": "WARNING", "propagate": False},
        "apps": {"handlers": ["console"], "level": LOG_LEVEL, "propagate": False},
        "infravision_ml": {"handlers": ["console"], "level": LOG_LEVEL, "propagate": False},
        "celery": {"handlers": ["console"], "level": "INFO", "propagate": False},
    },
}
