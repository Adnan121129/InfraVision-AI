"""Consistent, user-readable API error payloads.

Every error response has the shape::

    {"detail": "Human readable message", "code": "machine_code", "errors": {...field errors...}}
"""

from __future__ import annotations

import logging

from django.core.exceptions import PermissionDenied as DjangoPermissionDenied
from django.http import Http404
from rest_framework import exceptions, status
from rest_framework.response import Response
from rest_framework.views import exception_handler

logger = logging.getLogger(__name__)


class ServiceUnavailable(exceptions.APIException):
    status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    default_detail = "A required service is temporarily unavailable. Please retry shortly."
    default_code = "service_unavailable"


class StorageUnavailable(ServiceUnavailable):
    default_detail = "Image storage is temporarily unavailable. Your upload was not saved; please retry."
    default_code = "storage_unavailable"


class InvalidStateTransition(exceptions.APIException):
    status_code = status.HTTP_409_CONFLICT
    default_detail = "This action is not allowed in the resource's current state."
    default_code = "invalid_state"


def _first_message(data) -> str:
    if isinstance(data, str):
        return data
    if isinstance(data, list) and data:
        return _first_message(data[0])
    if isinstance(data, dict) and data:
        key, value = next(iter(data.items()))
        message = _first_message(value)
        if key in ("non_field_errors", "detail"):
            return message
        return f"{key.replace('_', ' ').capitalize()}: {message}"
    return "The request could not be processed."


def api_exception_handler(exc, context):
    if isinstance(exc, Http404):
        exc = exceptions.NotFound("The requested resource was not found.")
    elif isinstance(exc, DjangoPermissionDenied):
        exc = exceptions.PermissionDenied()

    response = exception_handler(exc, context)
    if response is None:
        logger.exception("Unhandled API error", exc_info=exc)
        return Response(
            {"detail": "An unexpected server error occurred. The team has been notified.", "code": "server_error"},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    data = response.data
    code = getattr(exc, "default_code", "error")
    if isinstance(exc, exceptions.APIException):
        codes = exc.get_codes()
        if isinstance(codes, str):
            code = codes

    if isinstance(data, dict) and set(data.keys()) <= {"detail", "code", "messages"}:
        payload = {"detail": _first_message(data.get("detail", data)), "code": data.get("code", code)}
    else:
        payload = {"detail": _first_message(data), "code": "validation_error" if response.status_code == 400 else code, "errors": data}

    response.data = payload
    return response
