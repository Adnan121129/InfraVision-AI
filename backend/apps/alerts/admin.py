from django.contrib import admin

from .models import MaintenanceAlert


@admin.register(MaintenanceAlert)
class MaintenanceAlertAdmin(admin.ModelAdmin):
    list_display = ("reference", "title", "structural_asset", "severity", "status", "created_at")
    list_filter = ("severity", "status", "alert_type")
    search_fields = ("reference", "title", "structural_asset__asset_name")
