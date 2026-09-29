from celery import shared_task

from .services import flag_overdue_assets


@shared_task(name="alerts.flag_overdue_inspections")
def flag_overdue_inspections() -> int:
    return flag_overdue_assets()
