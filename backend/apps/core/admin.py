from django.contrib import admin

from .models import PlatformConfiguration


@admin.register(PlatformConfiguration)
class PlatformConfigurationAdmin(admin.ModelAdmin):
    list_display = ("organization_name", "healthy_threshold", "critical_threshold", "auto_alerts_enabled", "updated_at")
