from rest_framework.routers import DefaultRouter

from .views import MaintenanceAlertViewSet

router = DefaultRouter()
router.register("alerts", MaintenanceAlertViewSet, basename="alert")

urlpatterns = router.urls
