import django_filters

from apps.core.choices import Severity

from .models import AlertStatus, AlertType, MaintenanceAlert


class MaintenanceAlertFilter(django_filters.FilterSet):
    status = django_filters.MultipleChoiceFilter(choices=AlertStatus.choices)
    severity = django_filters.MultipleChoiceFilter(choices=Severity.choices)
    alert_type = django_filters.MultipleChoiceFilter(choices=AlertType.choices)
    asset = django_filters.NumberFilter(field_name="structural_asset_id")
    inspection = django_filters.NumberFilter(field_name="inspection_id")
    defect_type = django_filters.CharFilter()
    date_from = django_filters.DateFilter(field_name="created_at", lookup_expr="date__gte")
    date_to = django_filters.DateFilter(field_name="created_at", lookup_expr="date__lte")
    active = django_filters.BooleanFilter(method="filter_active")

    class Meta:
        model = MaintenanceAlert
        fields = ("status", "severity", "alert_type", "asset", "inspection", "defect_type", "assigned_to")

    def filter_active(self, queryset, name, value):
        if value is None:
            return queryset
        active = [AlertStatus.OPEN, AlertStatus.INVESTIGATING]
        return queryset.filter(status__in=active) if value else queryset.exclude(status__in=active)
