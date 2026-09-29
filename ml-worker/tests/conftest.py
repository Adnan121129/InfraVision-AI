import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from infravision_ml.config import MLSettings  # noqa: E402

from .synthetic import clean_image, defective_image  # noqa: E402


@pytest.fixture
def settings() -> MLSettings:
    return MLSettings(inference_mode="demo", annotate=True)


@pytest.fixture
def defective():
    return defective_image()


@pytest.fixture
def clean() -> bytes:
    return clean_image()
