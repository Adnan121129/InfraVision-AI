import django_filters

from apps.assets.models import AssetType
from apps.core.choices import HealthStatus, InferenceMode, Severity

from .models import DefectDetection, DefectType, InspectionLog, InspectionStatus, InspectionType, ReviewStatus


class InspectionFilter(django_filters.FilterSet):
    asset = django_filters.NumberFilter(field_name="structural_asset_id")
    asset_type = django_filters.MultipleChoiceFilter(field_name="structural_asset__asset_type", choices=AssetType.choices)
    status = django_filters.MultipleChoiceFilter(choices=InspectionStatus.choices)
    inspection_type = django_filters.MultipleChoiceFilter(choices=InspectionType.choices)
    health_status = django_filters.MultipleChoiceFilter(choices=HealthStatus.choices)
    max_severity = django_filters.MultipleChoiceFilter(choices=Severity.choices)
    inference_mode = django_filters.ChoiceFilter(choices=InferenceMode.choices)
    date_from = django_filters.DateFilter(field_name="inspection_date", lookup_expr="date__gte")
    date_to = django_filters.DateFilter(field_name="inspection_date", lookup_expr="date__lte")

    class Meta:
        model = InspectionLog
        fields = ("asset", "status", "inspection_type", "health_status", "max_severity", "inspector", "inference_mode")


class DefectDetectionFilter(django_filters.FilterSet):
    defect_type = django_filters.MultipleChoiceFilter(choices=DefectType.choices)
    severity = django_filters.MultipleChoiceFilter(choices=Severity.choices)
    review_status = django_filters.MultipleChoiceFilter(choices=ReviewStatus.choices)
    asset = django_filters.NumberFilter(field_name="inspection__structural_asset_id")
    asset_type = django_filters.MultipleChoiceFilter(field_name="inspection__structural_asset__asset_type", choices=AssetType.choices)
    min_confidence = django_filters.NumberFilter(field_name="confidence_score", lookup_expr="gte")
    date_from = django_filters.DateFilter(field_name="inspection__inspection_date", lookup_expr="date__gte")
    date_to = django_filters.DateFilter(field_name="inspection__inspection_date", lookup_expr="date__lte")

    class Meta:
        model = DefectDetection
        fields = ("inspection", "image_record", "defect_type", "severity", "review_status")
