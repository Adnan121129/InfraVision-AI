from django.contrib import admin

from .models import MLModel


@admin.register(MLModel)
class MLModelAdmin(admin.ModelAdmin):
    list_display = ("model_name", "version", "framework", "status", "is_demo", "accuracy", "deployed_at")
    list_filter = ("status", "framework", "is_demo")
