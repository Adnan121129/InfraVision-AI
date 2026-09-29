from django.apps import AppConfig


class InspectionsConfig(AppConfig):
    name = "apps.inspections"
    label = "inspections"
    verbose_name = "AI inspections"

    def ready(self):
        from . import signals  # noqa: F401
