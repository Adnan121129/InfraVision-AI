from django.urls import path

from .consumers import InspectionEventsConsumer

websocket_urlpatterns = [
    path("ws/inspections/", InspectionEventsConsumer.as_asgi()),
]
