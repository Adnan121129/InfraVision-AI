import django_filters

from apps.core.choices import HealthStatus, RiskLevel

from .models import AssetType, MaterialType, StructuralAsset


class StructuralAssetFilter(django_filters.FilterSet):
    asset_type = django_filters.MultipleChoiceFilter(choices=AssetType.choices)
    material_type = django_filters.MultipleChoiceFilter(choices=MaterialType.choices)
    risk_level = django_filters.MultipleChoiceFilter(choices=RiskLevel.choices)
    health_status = django_filters.MultipleChoiceFilter(choices=HealthStatus.choices)
    region = django_filters.CharFilter(lookup_expr="iexact")
    min_health = django_filters.NumberFilter(field_name="current_health_score", lookup_expr="gte")
    max_health = django_filters.NumberFilter(field_name="current_health_score", lookup_expr="lte")
    archived = django_filters.BooleanFilter(field_name="is_archived")
    has_open_alerts = django_filters.BooleanFilter(method="filter_has_open_alerts")

    class Meta:
        model = StructuralAsset
        fields = ("asset_type", "material_type", "risk_level", "health_status", "region", "archived")

    def filter_has_open_alerts(self, queryset, name, value):
        if value is None:
            return queryset
        return queryset.filter(open_alerts_count__gt=0) if value else queryset.filter(open_alerts_count=0)
