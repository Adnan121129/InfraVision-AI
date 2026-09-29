from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView, SpectacularRedocView, SpectacularSwaggerView

api_patterns = [
    path("", include("apps.core.urls")),
    path("auth/", include("apps.users.auth_urls")),
    path("", include("apps.users.urls")),
    path("", include("apps.assets.urls")),
    path("", include("apps.inspections.urls")),
    path("", include("apps.alerts.urls")),
    path("", include("apps.analytics.urls")),
    path("", include("apps.ml.urls")),
    path("schema/", SpectacularAPIView.as_view(), name="schema"),
    path("docs/", SpectacularSwaggerView.as_view(url_name="schema"), name="swagger-ui"),
    path("redoc/", SpectacularRedocView.as_view(url_name="schema"), name="redoc"),
]

urlpatterns = [
    path("django-admin/", admin.site.urls),
    path("api/", include(api_patterns)),
]

if settings.DEBUG and not settings.USE_S3:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
