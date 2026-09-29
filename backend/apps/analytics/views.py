from __future__ import annotations

import logging

from django.conf import settings
from django.core.cache import cache
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import serializers
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.alerts.models import AlertStatus, AlertType
from apps.assets.models import AssetType, MaterialType
from apps.core.choices import HealthStatus, RiskLevel, Severity
from apps.inspections.models import DefectType, InspectionStatus, InspectionType, ProcessingStage, ReviewStatus
from apps.inspections.services import DASHBOARD_CACHE_KEY
from apps.users.models import Role

from .services import build_analytics, build_dashboard

logger = logging.getLogger(__name__)


class DashboardView(APIView):
    """Executive dashboard payload (cached briefly, invalidated when inspections complete)."""

    @extend_schema(responses=dict)
    def get(self, request):
        data = None
        try:
            data = cache.get(DASHBOARD_CACHE_KEY)
        except Exception:
            logger.warning("Dashboard cache unavailable", exc_info=True)
        if data is None:
            data = build_dashboard()
            try:
                cache.set(DASHBOARD_CACHE_KEY, data, settings.DASHBOARD_CACHE_SECONDS)
            except Exception:
                logger.warning("Could not cache dashboard", exc_info=True)
        return Response(data)


class AnalyticsFilterSerializer(serializers.Serializer):
    date_from = serializers.DateField(required=False)
    date_to = serializers.DateField(required=False)
    asset = serializers.IntegerField(required=False, min_value=1)
    asset_type = serializers.ListField(child=serializers.ChoiceField(choices=AssetType.choices), required=False)
    defect_type = serializers.ListField(child=serializers.ChoiceField(choices=DefectType.choices), required=False)
    severity = serializers.ListField(child=serializers.ChoiceField(choices=Severity.choices), required=False)

    def validate(self, attrs):
        if attrs.get("date_from") and attrs.get("date_to") and attrs["date_from"] > attrs["date_to"]:
            raise serializers.ValidationError({"date_from": "Start date must be before the end date."})
        return attrs


def _multi(request, key: str) -> list[str]:
    values = request.query_params.getlist(key)
    if len(values) == 1 and "," in values[0]:
        values = values[0].split(",")
    return [v for v in values if v]


class AnalyticsView(APIView):
    @extend_schema(
        parameters=[
            OpenApiParameter("date_from", str),
            OpenApiParameter("date_to", str),
            OpenApiParameter("asset", int),
            OpenApiParameter("asset_type", str, many=True),
            OpenApiParameter("defect_type", str, many=True),
            OpenApiParameter("severity", str, many=True),
        ],
        responses=dict,
    )
    def get(self, request):
        raw = {
            "date_from": request.query_params.get("date_from") or None,
            "date_to": request.query_params.get("date_to") or None,
            "asset": request.query_params.get("asset") or None,
            "asset_type": _multi(request, "asset_type"),
            "defect_type": _multi(request, "defect_type"),
            "severity": _multi(request, "severity"),
        }
        serializer = AnalyticsFilterSerializer(data={k: v for k, v in raw.items() if v not in (None, [])})
        serializer.is_valid(raise_exception=True)
        return Response(build_analytics(serializer.validated_data))


def _choices(enum) -> list[dict]:
    return [{"value": value, "label": label} for value, label in enum.choices]


class MetaView(APIView):
    """Enumerations used to build filters and forms in the dashboard."""

    @extend_schema(responses=dict)
    def get(self, request):
        return Response(
            {
                "asset_types": _choices(AssetType),
                "material_types": _choices(MaterialType),
                "risk_levels": _choices(RiskLevel),
                "health_statuses": _choices(HealthStatus),
                "severities": _choices(Severity),
                "inspection_types": _choices(InspectionType),
                "inspection_statuses": _choices(InspectionStatus),
                "processing_stages": _choices(ProcessingStage),
                "defect_types": _choices(DefectType),
                "review_statuses": _choices(ReviewStatus),
                "alert_statuses": _choices(AlertStatus),
                "alert_types": _choices(AlertType),
                "roles": _choices(Role),
                "upload_limits": {
                    "max_file_mb": settings.MAX_IMAGE_UPLOAD_MB,
                    "max_images": settings.MAX_IMAGES_PER_INSPECTION,
                    "extensions": list(settings.ALLOWED_IMAGE_EXTENSIONS),
                },
            }
        )
