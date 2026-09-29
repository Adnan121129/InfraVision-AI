"""JWT authentication for WebSocket connections.

Browsers cannot set an ``Authorization`` header on a WebSocket handshake, so
the short-lived access token is passed as the ``token`` query parameter.
"""

from __future__ import annotations

from urllib.parse import parse_qs

from channels.db import database_sync_to_async
from channels.middleware import BaseMiddleware
from django.contrib.auth.models import AnonymousUser


@database_sync_to_async
def _user_for_token(raw_token: str):
    from rest_framework_simplejwt.authentication import JWTAuthentication
    from rest_framework_simplejwt.exceptions import InvalidToken, TokenError

    auth = JWTAuthentication()
    try:
        validated = auth.get_validated_token(raw_token)
        user = auth.get_user(validated)
    except (InvalidToken, TokenError, Exception):
        return AnonymousUser()
    return user if user.is_active else AnonymousUser()


class JWTAuthMiddleware(BaseMiddleware):
    async def __call__(self, scope, receive, send):
        query = parse_qs(scope.get("query_string", b"").decode())
        token = (query.get("token") or [None])[0]
        scope["user"] = await _user_for_token(token) if token else AnonymousUser()
        return await super().__call__(scope, receive, send)
