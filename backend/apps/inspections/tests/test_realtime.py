import pytest
from asgiref.sync import async_to_sync
from channels.testing import WebsocketCommunicator
from rest_framework_simplejwt.tokens import AccessToken

from apps.inspections.models import InspectionLog
from apps.inspections.realtime import broadcast_inspection_update
from config.asgi import application

pytestmark = pytest.mark.django_db(transaction=True)


async def _connect(path):
    communicator = WebsocketCommunicator(application, path, headers=[(b"origin", b"http://localhost")])
    connected, code = await communicator.connect()
    return communicator, connected, code


def test_anonymous_websocket_is_rejected():
    async def scenario():
        communicator, connected, code = await _connect("/ws/inspections/")
        assert not connected
        assert code == 4401

    async_to_sync(scenario)()


def test_authenticated_client_receives_inspection_events(inspector, asset):
    token = str(AccessToken.for_user(inspector))
    inspection = InspectionLog.objects.create(structural_asset=asset, inspector=inspector)

    async def scenario():
        communicator, connected, _ = await _connect(f"/ws/inspections/?token={token}")
        assert connected
        assert (await communicator.receive_json_from())["type"] == "connection.ready"
        from asgiref.sync import sync_to_async

        await sync_to_async(broadcast_inspection_update)(inspection, "Inspection is now processing…")
        event = await communicator.receive_json_from(timeout=2)
        assert event["type"] == "inspection.update"
        assert event["inspection"]["reference"] == inspection.reference
        await communicator.send_json_to({"type": "ping"})
        assert (await communicator.receive_json_from())["type"] == "pong"
        await communicator.disconnect()

    async_to_sync(scenario)()
