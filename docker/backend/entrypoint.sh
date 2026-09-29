#!/bin/sh
# Container start-up tasks. Only the API container runs migrations and seeding
# (RUN_MIGRATIONS=true); workers start after it is healthy.
set -e

if [ "${RUN_MIGRATIONS:-false}" = "true" ]; then
  echo "[entrypoint] Applying database migrations"
  python manage.py migrate --noinput
  echo "[entrypoint] Ensuring object-storage bucket"
  python manage.py init_storage
  if [ "${SEED_DEMO_DATA:-false}" = "true" ]; then
    echo "[entrypoint] Seeding demo data (idempotent)"
    python manage.py seed_demo
  fi
fi

exec "$@"
