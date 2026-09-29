from django.apps import AppConfig


class MLConfig(AppConfig):
    name = "apps.ml"
    label = "ml"
    verbose_name = "Machine learning models"

    def ready(self):
        from . import signals  # noqa: F401
