"""Server-side validation of uploaded inspection imagery.

The browser validates too, but the API never trusts client checks: it checks
the extension, the size, and decodes the image header with Pillow to make sure
the bytes really are a supported image (and not a decompression bomb).
"""

from __future__ import annotations

import hashlib
import io
from dataclasses import dataclass

from django.conf import settings
from PIL import Image, UnidentifiedImageError
from rest_framework.exceptions import ValidationError

FORMAT_CONTENT_TYPES = {"JPEG": "image/jpeg", "PNG": "image/png", "WEBP": "image/webp"}
FORMAT_EXTENSIONS = {"JPEG": "jpg", "PNG": "png", "WEBP": "webp"}
MIN_DIMENSION = 64
EXIF_ORIENTATION_TAG = 0x0112


@dataclass(frozen=True)
class ValidatedImage:
    content: bytes
    width: int
    height: int
    image_format: str
    content_type: str
    extension: str
    checksum: str


def validate_inspection_image(uploaded_file) -> ValidatedImage:
    name = getattr(uploaded_file, "name", "") or ""
    extension = name.rsplit(".", 1)[-1].lower() if "." in name else ""
    if extension not in settings.ALLOWED_IMAGE_EXTENSIONS:
        allowed = ", ".join(ext.upper() for ext in settings.ALLOWED_IMAGE_EXTENSIONS)
        raise ValidationError({"file": f"Unsupported file type '.{extension or '?'}'. Supported formats: {allowed}."})

    max_bytes = settings.MAX_IMAGE_UPLOAD_MB * 1024 * 1024
    size = getattr(uploaded_file, "size", None) or 0
    if size == 0:
        raise ValidationError({"file": "The uploaded file is empty."})
    if size > max_bytes:
        raise ValidationError({"file": f"Image exceeds the {settings.MAX_IMAGE_UPLOAD_MB} MB limit ({size / 1024 / 1024:.1f} MB)."})

    content = uploaded_file.read()
    Image.MAX_IMAGE_PIXELS = settings.MAX_IMAGE_PIXELS
    try:
        with Image.open(io.BytesIO(content)) as probe:
            probe.verify()
        with Image.open(io.BytesIO(content)) as image:
            image_format = image.format
            width, height = image.size
            orientation = image.getexif().get(EXIF_ORIENTATION_TAG, 1)
    except Image.DecompressionBombError:
        raise ValidationError({"file": "Image resolution is too large to process safely."})
    except (UnidentifiedImageError, OSError, SyntaxError, ValueError):
        raise ValidationError({"file": "The file is not a valid or readable image. It may be corrupted."})

    if image_format not in FORMAT_CONTENT_TYPES:
        raise ValidationError({"file": f"Image format {image_format} is not supported. Use JPG, PNG or WEBP."})
    # EXIF orientations 5-8 rotate by 90 degrees: store the dimensions as displayed.
    if orientation in (5, 6, 7, 8):
        width, height = height, width
    if min(width, height) < MIN_DIMENSION:
        raise ValidationError({"file": f"Image is too small ({width}x{height}). Minimum size is {MIN_DIMENSION}px."})

    return ValidatedImage(
        content=content,
        width=width,
        height=height,
        image_format=image_format,
        content_type=FORMAT_CONTENT_TYPES[image_format],
        extension=FORMAT_EXTENSIONS[image_format],
        checksum=hashlib.sha256(content).hexdigest(),
    )
