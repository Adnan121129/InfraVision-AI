# syntax=docker/dockerfile:1.7
# Django API, default Celery worker and Celery beat share this image.
FROM python:3.11-slim AS builder
ENV PIP_NO_CACHE_DIR=1 PIP_DISABLE_PIP_VERSION_CHECK=1
RUN python -m venv /opt/venv
ENV PATH=/opt/venv/bin:$PATH
COPY backend/requirements.txt /tmp/requirements.txt
RUN pip install -r /tmp/requirements.txt

FROM python:3.11-slim AS runtime
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH=/opt/venv/bin:$PATH \
    DJANGO_SETTINGS_MODULE=config.settings
RUN groupadd --system app && useradd --system --gid app --home /app app
COPY --from=builder /opt/venv /opt/venv
WORKDIR /app/backend
COPY backend/ /app/backend/
COPY docker/backend/entrypoint.sh /usr/local/bin/entrypoint.sh
# Static files are collected at build time with a throwaway key (never used at runtime).
RUN DJANGO_SECRET_KEY=build-only-collectstatic DJANGO_DEBUG=false python manage.py collectstatic --noinput -v0 \
    && chmod +x /usr/local/bin/entrypoint.sh \
    && mkdir -p /app/backend/media && chown -R app:app /app
USER app
EXPOSE 8000
HEALTHCHECK --interval=20s --timeout=5s --start-period=40s --retries=5 \
  CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/api/health/', timeout=4).status == 200 else 1)"
ENTRYPOINT ["entrypoint.sh"]
CMD ["uvicorn", "config.asgi:application", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips", "*", "--workers", "2"]
