from rest_framework.routers import DefaultRouter

from .views import MLModelViewSet

router = DefaultRouter()
router.register("models", MLModelViewSet, basename="ml-model")

urlpatterns = router.urls
