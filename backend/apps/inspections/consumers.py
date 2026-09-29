from __future__ import annotations

from channels.generic.websocket import AsyncJsonWebsocketConsumer

from .realtime import INSPECTIONS_GROUP


class InspectionEventsConsumer(AsyncJsonWebsocketConsumer):
    """Streams inspection status changes and new alerts to authenticated users."""

    async def connect(self):
        user = self.scope.get("user")
        if user is None or not user.is_authenticated:
            await self.close(code=4401)
            return
        await self.channel_layer.group_add(INSPECTIONS_GROUP, self.channel_name)
        await self.accept()
        await self.send_json({"type": "connection.ready"})

    async def disconnect(self, code):
        await self.channel_layer.group_discard(INSPECTIONS_GROUP, self.channel_name)

    async def receive_json(self, content, **kwargs):
        if content.get("type") == "ping":
            await self.send_json({"type": "pong"})

    async def inspection_update(self, event):
        await self.send_json(event)

    async def alert_created(self, event):
        await self.send_json(event)
