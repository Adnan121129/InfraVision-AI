from django.urls import path

from .views import AnalyticsView, DashboardView, MetaView

urlpatterns = [
    path("dashboard/", DashboardView.as_view(), name="dashboard"),
    path("analytics/", AnalyticsView.as_view(), name="analytics"),
    path("meta/", MetaView.as_view(), name="meta"),
]
