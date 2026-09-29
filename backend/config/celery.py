"""Celery application.

Two worker pools consume from Redis:

* ``celery-worker`` - the ``default`` queue: image derivatives, alerting and
  scheduled maintenance tasks.
* ``ml-worker`` - the ``inference`` queue: loads the deep-learning model once
  per process and writes predictions back to PostgreSQL.
"""

import os

from celery import Celery

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

app = Celery("infravision")
app.config_from_object("django.conf:settings", namespace="CELERY")
app.autodiscover_tasks()
