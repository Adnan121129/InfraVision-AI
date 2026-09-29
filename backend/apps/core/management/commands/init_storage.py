from django.core.management.base import BaseCommand

from apps.core.storage import ensure_bucket, object_storage


class Command(BaseCommand):
    help = "Create the object-storage bucket (MinIO/S3) if it does not exist."

    def handle(self, *args, **options):
        ensure_bucket()
        backend = "S3/MinIO" if object_storage.is_s3 else "local filesystem"
        self.stdout.write(self.style.SUCCESS(f"Object storage ready ({backend})."))
