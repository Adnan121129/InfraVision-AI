from __future__ import annotations

from django.db.models import Count, Q
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.alerts.models import AlertStatus
from apps.inspections.models import InspectionStatus
from apps.users.models import Role
from apps.users.permissions import RoleBasedAccess

from .filters import StructuralAssetFilter
from .models import StructuralAsset
from .serializers import AssetMapSerializer, AssetOptionSerializer, StructuralAssetSerializer
from .services import build_risk_analysis

OPEN_ALERTS = Q(alerts__status__in=[AlertStatus.OPEN, AlertStatus.INVESTIGATING])


class StructuralAssetViewSet(viewsets.ModelViewSet):
    """Structural asset register. Archiving is preferred over deletion."""

    serializer_class = StructuralAssetSerializer
    permission_classes = (RoleBasedAccess,)
    write_role = Role.ENGINEER
    delete_role = Role.ADMINISTRATOR
    action_roles = {"archive": Role.ENGINEER, "restore": Role.ENGINEER}
    filterset_class = StructuralAssetFilter
    search_fields = ("asset_name", "asset_code", "location", "region", "description", "operator")
    ordering_fields = (
        "asset_name",
        "asset_code",
        "asset_type",
        "current_health_score",
        "risk_level",
        "last_inspection_at",
        "created_at",
        "open_alerts_count",
    )
    ordering = ("asset_name",)

    def get_queryset(self):
        qs = StructuralAsset.objects.annotate(
            open_alerts_count=Count("alerts", filter=OPEN_ALERTS, distinct=True),
            inspections_count=Count("inspections", distinct=True),
        )
        archived_param = self.request.query_params.get("archived")
        if self.action == "list" and archived_param is None:
            qs = qs.filter(is_archived=False)
        return qs

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    @action(detail=True, methods=["post"])
    def archive(self, request, pk=None):
        asset = self.get_object()
        asset.is_archived = True
        asset.save(update_fields=["is_archived", "updated_at"])
        return Response(self.get_serializer(asset).data)

    @action(detail=True, methods=["post"])
    def restore(self, request, pk=None):
        asset = self.get_object()
        asset.is_archived = False
        asset.save(update_fields=["is_archived", "updated_at"])
        return Response(self.get_serializer(asset).data)

    @extend_schema(responses=AssetMapSerializer(many=True))
    @action(detail=False, methods=["get"], pagination_class=None, filterset_class=StructuralAssetFilter)
    def map(self, request):
        """Lightweight, unpaginated payload of geolocated assets for the infrastructure map."""
        qs = self.filter_queryset(self.get_queryset()).filter(latitude__isnull=False, longitude__isnull=False)
        return Response(AssetMapSerializer(qs, many=True).data)

    @extend_schema(responses=AssetOptionSerializer(many=True))
    @action(detail=False, methods=["get"], pagination_class=None)
    def options(self, request):
        """Compact list used by selectors (e.g. the New Inspection form)."""
        qs = StructuralAsset.objects.filter(is_archived=False).order_by("asset_name")
        return Response(AssetOptionSerializer(qs, many=True).data)

    @extend_schema(parameters=[OpenApiParameter("limit", int)])
    @action(detail=True, methods=["get"], url_path="health-history")
    def health_history(self, request, pk=None):
        asset = self.get_object()
        limit = min(int(request.query_params.get("limit", 36)), 120)
        rows = (
            asset.inspections.filter(status=InspectionStatus.COMPLETED, overall_health_score__isnull=False)
            .order_by("-inspection_date")
            .values("id", "reference", "inspection_date", "overall_health_score", "defect_count", "max_severity")[:limit]
        )
        return Response(list(reversed(list(rows))))

    @action(detail=True, methods=["get"], url_path="risk-analysis")
    def risk_analysis(self, request, pk=None):
        """System-generated risk analysis and maintenance priority (decision support only)."""
        return Response(build_risk_analysis(self.get_object()))

    @action(detail=True, methods=["get"], url_path="defect-summary")
    def defect_summary(self, request, pk=None):
        from apps.inspections.models import DefectDetection

        asset = self.get_object()
        base = DefectDetection.objects.filter(
            inspection__structural_asset=asset, inspection__status=InspectionStatus.COMPLETED
        ).exclude(review_status="REJECTED")
        by_type = list(base.values("defect_type").annotate(count=Count("id")).order_by("-count"))
        by_severity = list(base.values("severity").annotate(count=Count("id")))
        return Response({"by_type": by_type, "by_severity": by_severity, "total": base.count()})

    def destroy(self, request, *args, **kwargs):
        asset = self.get_object()
        asset.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
