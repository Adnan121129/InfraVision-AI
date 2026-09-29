from django.urls import path

from .views import HealthCheckView, PlatformConfigurationView

urlpatterns = [
    path("health/", HealthCheckView.as_view(), name="health"),
    path("settings/", PlatformConfigurationView.as_view(), name="platform-settings"),
]
