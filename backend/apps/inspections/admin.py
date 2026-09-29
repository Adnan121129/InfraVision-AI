from django.contrib import admin

from .models import DefectDetection, ImageRecord, InspectionLog


class ImageRecordInline(admin.TabularInline):
    model = ImageRecord
    extra = 0
    fields = ("original_filename", "image_width", "image_height", "file_size", "health_score")
    readonly_fields = fields


@admin.register(InspectionLog)
class InspectionLogAdmin(admin.ModelAdmin):
    list_display = ("reference", "structural_asset", "inspection_date", "status", "overall_health_score", "defect_count", "inference_mode")
    list_filter = ("status", "inspection_type", "inference_mode", "health_status")
    search_fields = ("reference", "structural_asset__asset_name")
    readonly_fields = ("reference", "celery_task_id", "preprocessing_report", "summary")
    inlines = (ImageRecordInline,)


@admin.register(DefectDetection)
class DefectDetectionAdmin(admin.ModelAdmin):
    list_display = ("id", "inspection", "defect_type", "severity", "confidence_score", "review_status")
    list_filter = ("defect_type", "severity", "review_status")
