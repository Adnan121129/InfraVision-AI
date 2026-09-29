# syntax=docker/dockerfile:1.7
# Dedicated ML worker: consumes the Celery "inference" queue, runs OpenCV +
# PyTorch inference via the framework-agnostic infravision_ml package and
# writes predictions to PostgreSQL through the Django ORM.
FROM python:3.11-slim AS builder
ARG INSTALL_PYTORCH=true
ARG TORCH_INDEX_URL=https://download.pytorch.org/whl/cpu
ENV PIP_NO_CACHE_DIR=1 PIP_DISABLE_PIP_VERSION_CHECK=1
RUN python -m venv /opt/venv
ENV PATH=/opt/venv/bin:$PATH
COPY backend/requirements.txt /tmp/backend-requirements.txt
COPY ml-worker/requirements.txt /tmp/ml-requirements.txt
COPY ml-worker/requirements-pytorch.txt /tmp/ml-pytorch.txt
RUN pip install -r /tmp/backend-requirements.txt -r /tmp/ml-requirements.txt \
    && if [ "$INSTALL_PYTORCH" = "true" ]; then pip install --index-url "$TORCH_INDEX_URL" -r /tmp/ml-pytorch.txt; fi

FROM python:3.11-slim AS runtime
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH=/opt/venv/bin:$PATH \
    PYTHONPATH=/app/ml-worker \
    DJANGO_SETTINGS_MODULE=config.settings \
    ML_WORKER_ROLE=inference \
    MODEL_DIR=/models
RUN groupadd --system app && useradd --system --gid app --home /app app
COPY --from=builder /opt/venv /opt/venv
COPY backend/ /app/backend/
COPY ml-worker/ /app/ml-worker/
RUN mkdir -p /models && chown -R app:app /app /models
USER app
WORKDIR /app/backend
VOLUME ["/models"]
HEALTHCHECK --interval=30s --timeout=15s --start-period=60s --retries=5 \
  CMD celery -A config inspect ping -d "ml@$HOSTNAME" --timeout 10 >/dev/null || exit 1
# The solo pool keeps one model instance per container; scale with replicas.
CMD ["celery", "-A", "config", "worker", "-Q", "inference", "--pool=solo", "-n", "ml@%h", "--loglevel=INFO"]
