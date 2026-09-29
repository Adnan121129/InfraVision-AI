from __future__ import annotations

from django.db.models import Case, Count, IntegerField, Q, Value, When
from drf_spectacular.utils import extend_schema
from rest_framework import mixins, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response

from apps.assets.services import refresh_asset_health
from apps.core.choices import Severity
from apps.users.models import Role, User
from apps.users.permissions import RoleBasedAccess

from .filters import MaintenanceAlertFilter
from .models import AlertStatus, MaintenanceAlert
from .serializers import AlertUpdateSerializer, MaintenanceAlertSerializer
from .services import transition_alert

SEVERITY_ORDER = Case(
    When(severity=Severity.CRITICAL, then=Value(4)),
    When(severity=Severity.HIGH, then=Value(3)),
    When(severity=Severity.MEDIUM, then=Value(2)),
    default=Value(1),
    output_field=IntegerField(),
)


class MaintenanceAlertViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, mixins.UpdateModelMixin, viewsets.GenericViewSet):
    """Maintenance alert centre.

    Inspectors may acknowledge alerts (move them to *investigating*); engineers
    may also resolve/reopen and assign them.
    """

    serializer_class = MaintenanceAlertSerializer
    permission_classes = (RoleBasedAccess,)
    write_role = Role.INSPECTOR
    filterset_class = MaintenanceAlertFilter
    search_fields = ("reference", "title", "description", "structural_asset__asset_name", "structural_asset__asset_code", "inspection__reference")
    ordering_fields = ("created_at", "severity_rank", "status", "resolved_at")
    ordering = ("-created_at",)

    def get_queryset(self):
        return MaintenanceAlert.objects.select_related(
            "structural_asset", "inspection", "assigned_to", "resolved_by"
        ).annotate(severity_rank=SEVERITY_ORDER)

    @extend_schema(request=AlertUpdateSerializer, responses=MaintenanceAlertSerializer)
    def partial_update(self, request, *args, **kwargs):
        alert = self.get_object()
        payload = AlertUpdateSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        data = payload.validated_data
        user = request.user

        new_status = data.get("status")
        if new_status and new_status != alert.status:
            if new_status != AlertStatus.INVESTIGATING and not user.has_role_at_least(Role.ENGINEER):
                raise PermissionDenied("Only engineers can resolve or reopen alerts.")
            transition_alert(alert, new_status, user, data.get("resolution_notes", ""))
            refresh_asset_health(alert.structural_asset)
        elif "resolution_notes" in data:
            alert.resolution_notes = data["resolution_notes"]
            alert.save(update_fields=["resolution_notes", "updated_at"])

        if "assigned_to" in data:
            if not user.has_role_at_least(Role.ENGINEER):
                raise PermissionDenied("Only engineers can assign alerts.")
            assignee_id = data["assigned_to"]
            if assignee_id is not None and not User.objects.filter(pk=assignee_id, is_active=True).exists():
                raise ValidationError({"assigned_to": "Unknown or inactive user."})
            alert.assigned_to_id = assignee_id
            alert.save(update_fields=["assigned_to", "updated_at"])

        alert.refresh_from_db()
        return Response(self.get_serializer(alert).data)

    def update(self, request, *args, **kwargs):
        return self.partial_update(request, *args, **kwargs)

    @action(detail=False, methods=["get"])
    def summary(self, request):
        qs = self.filter_queryset(MaintenanceAlert.objects.all())
        data = qs.aggregate(
            total=Count("id"),
            open=Count("id", filter=Q(status=AlertStatus.OPEN)),
            investigating=Count("id", filter=Q(status=AlertStatus.INVESTIGATING)),
            resolved=Count("id", filter=Q(status=AlertStatus.RESOLVED)),
            critical_active=Count("id", filter=Q(severity=Severity.CRITICAL) & ~Q(status=AlertStatus.RESOLVED)),
            high_active=Count("id", filter=Q(severity=Severity.HIGH) & ~Q(status=AlertStatus.RESOLVED)),
        )
        return Response(data)
