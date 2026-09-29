from __future__ import annotations

import logging

from django.conf import settings
from django.core.cache import cache
from django.db import connection
from drf_spectacular.utils import extend_schema
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.users.permissions import IsAdministrator

from .models import PlatformConfiguration
from .serializers import PlatformConfigurationSerializer
from .storage import object_storage

logger = logging.getLogger(__name__)


class HealthCheckView(APIView):
    """Liveness/readiness probe used by Docker health checks and load balancers."""

    authentication_classes = ()
    permission_classes = (permissions.AllowAny,)
    throttle_classes = ()

    @extend_schema(responses={200: dict, 503: dict})
    def get(self, request):
        checks = {"database": False, "cache": False}
        try:
            with connection.cursor() as cursor:
                cursor.execute("SELECT 1")
            checks["database"] = True
        except Exception:
            logger.warning("Database health check failed", exc_info=True)
        try:
            cache.set("healthcheck", "ok", 5)
            checks["cache"] = cache.get("healthcheck") == "ok"
        except Exception:
            logger.warning("Cache health check failed", exc_info=True)
        if request.query_params.get("deep") == "1":
            checks["storage"] = object_storage.healthcheck()

        healthy = all(checks.values())
        return Response(
            {"status": "ok" if healthy else "degraded", "checks": checks, "storage_backend": "s3" if settings.USE_S3 else "filesystem"},
            status=status.HTTP_200_OK if healthy else status.HTTP_503_SERVICE_UNAVAILABLE,
        )


class PlatformConfigurationView(APIView):
    """Read (any authenticated user) or update (administrators) the platform configuration."""

    def get_permissions(self):
        if self.request.method in permissions.SAFE_METHODS:
            return [permissions.IsAuthenticated()]
        return [IsAdministrator()]

    @extend_schema(responses=PlatformConfigurationSerializer)
    def get(self, request):
        return Response(PlatformConfigurationSerializer(PlatformConfiguration.load()).data)

    @extend_schema(request=PlatformConfigurationSerializer, responses=PlatformConfigurationSerializer)
    def patch(self, request):
        config = PlatformConfiguration.objects.get_or_create(pk=1)[0]
        serializer = PlatformConfigurationSerializer(config, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save(updated_by=request.user)
        return Response(serializer.data)

    put = patch
