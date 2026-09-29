from rest_framework.routers import DefaultRouter

from .views import StructuralAssetViewSet

router = DefaultRouter()
router.register("assets", StructuralAssetViewSet, basename="asset")

urlpatterns = router.urls
