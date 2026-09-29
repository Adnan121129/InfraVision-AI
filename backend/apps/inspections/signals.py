"""Remove stored imagery when image records are deleted."""

from django.db import transaction
from django.db.models.signals import post_delete
from django.dispatch import receiver

from apps.core.storage import object_storage

from .models import ImageRecord

# Keys under this prefix are shared seed imagery reused by many demo records.
SHARED_PREFIXES = ("demo/",)


@receiver(post_delete, sender=ImageRecord)
def delete_image_objects(sender, instance: ImageRecord, **kwargs):
    keys = [instance.storage_key, instance.thumbnail_key, instance.preview_key, instance.annotated_key]
    keys = [k for k in keys if k and not k.startswith(SHARED_PREFIXES)]

    def _cleanup():
        for key in keys:
            object_storage.delete(key)

    transaction.on_commit(_cleanup)
