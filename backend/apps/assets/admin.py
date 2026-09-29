from django.contrib import admin

from .models import StructuralAsset


@admin.register(StructuralAsset)
class StructuralAssetAdmin(admin.ModelAdmin):
    list_display = ("asset_code", "asset_name", "asset_type", "material_type", "current_health_score", "risk_level", "is_archived")
    list_filter = ("asset_type", "material_type", "risk_level", "is_archived")
    search_fields = ("asset_code", "asset_name", "location")
    readonly_fields = ("asset_code", "current_health_score", "health_status", "risk_level", "last_inspection_at")
