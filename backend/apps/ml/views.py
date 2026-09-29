from __future__ import annotations

from django.db.models import Avg, Count, Max, Q
from rest_framework import mixins, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.inspections.models import InspectionStatus
from apps.users.models import Role
from apps.users.permissions import RoleBasedAccess

from .models import MLModel, ModelStatus
from .serializers import MLModelSerializer


def annotated_models():
    return MLModel.objects.annotate(
        inspections_processed=Count("inspections", filter=Q(inspections__status=InspectionStatus.COMPLETED), distinct=True),
        failed_inspections=Count("inspections", filter=Q(inspections__status=InspectionStatus.FAILED), distinct=True),
        avg_processing_time=Avg("inspections__processing_time", filter=Q(inspections__status=InspectionStatus.COMPLETED)),
        last_used_at=Max("inspections__completed_at"),
    )


class MLModelViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, mixins.UpdateModelMixin, viewsets.GenericViewSet):
    """Model registry. Administrators may edit description/status; models are registered by the ML worker."""

    serializer_class = MLModelSerializer
    permission_classes = (RoleBasedAccess,)
    write_role = Role.ADMINISTRATOR
    filterset_fields = ("status", "framework", "is_demo")
    search_fields = ("model_name", "version", "architecture")
    ordering_fields = ("deployed_at", "created_at", "accuracy", "model_name")

    def get_queryset(self):
        return annotated_models()

    def retrieve(self, request, *args, **kwargs):
        instance = self.get_object()
        data = self.get_serializer(instance).data
        from apps.inspections.models import DefectDetection

        stats = DefectDetection.objects.filter(inspection__ml_model=instance).aggregate(
            detections_count=Count("id"), avg_confidence=Avg("confidence_score")
        )
        data.update(stats)
        return Response(data)

    @action(detail=False, methods=["get"])
    def active(self, request):
        """The model currently serving inference (null when no worker has registered one)."""
        from apps.inspections.models import DefectDetection

        model = annotated_models().filter(status=ModelStatus.ACTIVE).order_by("-last_heartbeat_at").first()
        if model is None:
            return Response(None)
        data = self.get_serializer(model).data
        data.update(
            DefectDetection.objects.filter(inspection__ml_model=model).aggregate(
                detections_count=Count("id"), avg_confidence=Avg("confidence_score")
            )
        )
        return Response(data)
