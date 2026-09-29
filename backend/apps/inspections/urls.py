from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import DefectDetectionViewSet, ImageRecordViewSet, ImageUploadView, InspectionViewSet

router = DefaultRouter()
router.register("inspections", InspectionViewSet, basename="inspection")
router.register("images", ImageRecordViewSet, basename="image")
router.register("detections", DefectDetectionViewSet, basename="detection")

urlpatterns = [
    path("images/upload/", ImageUploadView.as_view(), name="image-upload"),
    *router.urls,
]
