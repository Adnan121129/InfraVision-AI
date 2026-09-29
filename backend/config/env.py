"""Small helpers for reading typed configuration from environment variables.

All secrets and deployment-specific values are provided through the
environment (see ``.env.example`` at the repository root). Nothing sensitive
is ever hard-coded in the source tree.
"""

from __future__ import annotations

import os
from typing import Any

_TRUE_VALUES = {"1", "true", "yes", "on"}


def env_str(name: str, default: str | None = None) -> str | None:
    value = os.environ.get(name)
    if value is None or value == "":
        return default
    return value


def env_bool(name: str, default: bool = False) -> bool:
    value = os.environ.get(name)
    if value is None or value == "":
        return default
    return value.strip().lower() in _TRUE_VALUES


def env_int(name: str, default: int) -> int:
    value = os.environ.get(name)
    if value is None or value == "":
        return default
    return int(value)


def env_float(name: str, default: float) -> float:
    value = os.environ.get(name)
    if value is None or value == "":
        return default
    return float(value)


def env_list(name: str, default: list[str] | None = None, separator: str = ",") -> list[str]:
    value = os.environ.get(name)
    if value is None or value.strip() == "":
        return list(default or [])
    return [item.strip() for item in value.split(separator) if item.strip()]


def env_required(name: str) -> Any:
    value = os.environ.get(name)
    if value is None or value == "":
        from django.core.exceptions import ImproperlyConfigured

        raise ImproperlyConfigured(f"The {name} environment variable is required.")
    return value
