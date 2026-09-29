# InfraVision AI

**AI-powered predictive infrastructure maintenance platform.**

InfraVision AI turns structural inspection imagery (drone surveys, fixed cameras, handheld photos) into
actionable asset-health intelligence. Computer vision detects structural defects, a rule-based model
rates their severity, every inspection updates a 0–100 health index, and maintenance alerts, risk
analysis and portfolio analytics help engineers decide what to fix first.

![Executive dashboard](docs/screenshots/dashboard.jpg)

| AI inspection results | Analytics |
|---|---|
| ![Inspection results](docs/screenshots/inspection-results.jpg) | ![Analytics](docs/screenshots/analytics.jpg) |
| **System architecture** | **Landing page** |
| ![Architecture](docs/screenshots/architecture.jpg) | ![Landing](docs/screenshots/landing.jpg) |

> **About the AI results you see out of the box.** No trained weights ship with the repository.
> Until you deploy a trained checkpoint, the ML worker runs a clearly-labelled **demo heuristic
> detector** (classical OpenCV rules, not a neural network). Every result it produces is stored with
> `inference_mode = "demo"` and shown with a **Demo inference** badge; its accuracy is reported as
> "Not benchmarked". Seeded demo data uses synthetic imagery and is labelled the same way.
> See [Replacing demo inference with a trained model](#replacing-demo-inference-with-a-trained-model).

---

## Contents

1. [Features](#features)
2. [Architecture](#architecture)
3. [Technology stack](#technology-stack)
4. [Project structure](#project-structure)
5. [Quick start (Docker)](#quick-start-docker)
6. [Demo credentials](#demo-credentials)
7. [Environment variables](#environment-variables)
8. [Local development without Docker](#local-development-without-docker)
9. [Database & migrations](#database--migrations)
10. [Object storage (MinIO / S3)](#object-storage-minio--s3)
11. [Celery workers](#celery-workers)
12. [Machine-learning module](#machine-learning-module)
13. [Replacing demo inference with a trained model](#replacing-demo-inference-with-a-trained-model)
14. [API documentation](#api-documentation)
15. [Real-time updates](#real-time-updates)
16. [Security](#security)
17. [Testing](#testing)
18. [Production deployment](#production-deployment)

---

## Features

- **Asset register** – bridges, roads, buildings, tunnels, towers, dams and industrial structures with
  location, material, construction details, health score and risk level; search, filters, sorting,
  pagination, archive/restore and an asset intelligence page.
- **AI inspection workflow** – drag-and-drop uploads with per-file progress, server-side validation,
  S3/MinIO storage, asynchronous Celery inference and a live processing timeline
  (Uploading → Stored → Queued → Preprocessing → AI inference → Analyzing defects → Completed).
- **Inspection results** – original and annotated images side by side, bounding boxes, defect type,
  confidence, severity (Low/Medium/High/Critical), overall health score, confidence distribution,
  the preprocessing report, model version and inference time.
- **Human-in-the-loop review** – engineers confirm or reject each detection (AI Analysis page).
- **Maintenance alerts** – raised automatically for severe findings, sharp health declines and overdue
  inspections; Open → Investigating → Resolved workflow with assignment and resolution notes.
- **Risk analysis** – system-generated maintenance priority (P1–P4) from health, trend, severe
  defects, open alerts, inspection age and structure age – always labelled as decision support.
- **Dashboards & analytics** – KPIs, health distribution, fleet health index, recent inspections,
  critical alerts, processing queue, infrastructure map, AI model status and ten filterable analytics
  charts.
- **Model registry** – the ML worker registers the model it actually serves; demo vs production is
  explicit everywhere.
- **Administration** – users and roles, platform thresholds and alert rules, service health.
- **Real-time** – Django Channels WebSocket events with automatic polling fallback.

## Architecture

The implementation follows the reference architecture in
[`docs/architecture-reference.png`](docs/architecture-reference.png):

```
                         HTTPS (REST + WSS)                       Async (Redis)
  ┌──────────────────┐ ───────────────────▶ ┌──────────────────┐ ─────────────▶ ┌──────────────────┐
  │  React Dashboard │                      │  Django REST API │                │   Celery Queue   │
  │  Web frontend/UI │ ◀─ realtime events ─ │  Core controller │                │ Redis dispatcher │
  └──────────────────┘   (Django Channels)  └──────────────────┘                └──────────────────┘
                                    Metadata  │            │ Raw visuals                │ Inference
                                              ▼            ▼                            ▼
                               ┌──────────────────┐  ┌──────────────────┐  fetch  ┌──────────────────┐
                               │    PostgreSQL    │  │ S3/MinIO Storage │ ◀────── │ TF/PyTorch Worker│
                               │ Relational store │  │  Blob store      │         │ CNN inference    │
                               └──────────────────┘  └──────────────────┘         └──────────────────┘
                                        ▲                                                  │
                                        └──────────────── Write predictions ───────────────┘
```

**Request lifecycle**

1. The user uploads imagery from React (`POST /api/images/upload/`, multipart, one request per file).
2. Django validates extension, size, dimensions and decodes the header with Pillow
   (decompression-bomb protection).
3. The original is stored in S3/MinIO; a Celery task on the `default` queue creates a 360 px thumbnail
   and a 1600 px preview so originals never need to reach the browser.
4. `POST /api/inspections/{id}/submit/` marks the `InspectionLog` **QUEUED**, stores the Celery task ID
   and publishes `inspections.run_inference` to the `inference` queue in Redis.
5. The **ML worker** container (own image, PyTorch + OpenCV) loads the model once per process, fetches
   each image from storage and runs `PredictionService`: OpenCV preprocessing → model inference →
   NMS / coordinate mapping → severity classification → health scoring → annotated image.
6. Predictions (defect type, confidence, severity, bounding boxes, processing time, model version,
   preprocessing report) are written to PostgreSQL; asset health, risk and alerts are updated.
7. Every state change is broadcast over WebSockets; clients without a socket poll `/status/`.

Heavy ML work never runs inside an HTTP request. `recover_stalled_inspections` (Celery beat) fails
inspections whose worker disappeared so they can be retried.

**Separation of concerns.** Django never imports a deep-learning framework. The only coupling is
`infravision_ml.services.PredictionService`, loaded lazily by `apps.ml.services` inside the ML worker.
The API image and the default Celery worker do not contain OpenCV or PyTorch.

## Technology stack

| Layer | Technology |
|---|---|
| Frontend | React 19, TypeScript, Vite, Tailwind CSS 4, React Router 7, Axios, Recharts, Leaflet / OpenStreetMap (CARTO dark tiles), lucide icons |
| API | Python 3.11, Django 5.2, Django REST Framework, SimpleJWT (rotation + blacklist), django-filter, drf-spectacular (OpenAPI), Django Channels, Uvicorn (ASGI) |
| Async | Celery 5 (`default` + `inference` queues, beat), Redis 7 |
| Database | PostgreSQL 16 |
| Object storage | MinIO (local) / AWS S3 via django-storages + boto3, SigV4 presigned URLs |
| ML | PyTorch + torchvision (ResNet-50 / ResNet-18 / EfficientNet-B0 / MobileNetV3, timm for Xception), OpenCV, NumPy |
| Infrastructure | Docker, Docker Compose, nginx, GitHub Actions CI |

## Project structure

```
.
├── backend/                         Django project
│   ├── config/                      settings (env-driven), urls, asgi (HTTP + WebSocket), celery app
│   ├── apps/
│   │   ├── core/                    storage abstraction, platform settings, errors, health, demo seeding
│   │   │   └── management/commands/ seed_demo, init_storage
│   │   ├── users/                   custom User (email login), roles, JWT auth, RBAC permissions
│   │   ├── assets/                  StructuralAsset, health refresh, system risk analysis
│   │   ├── inspections/             InspectionLog, ImageRecord, DefectDetection, services, Celery tasks,
│   │   │                            upload validation, WebSocket consumer
│   │   ├── alerts/                  MaintenanceAlert, alert rules, overdue-inspection task
│   │   ├── analytics/               dashboard + analytics aggregations, metadata endpoint
│   │   └── ml/                      MLModel registry, bridge to infravision_ml, worker start-up hook
│   ├── requirements.txt / requirements-dev.txt
│   └── pytest.ini, conftest.py
├── ml-worker/                       framework-agnostic ML package (no Django dependency)
│   ├── infravision_ml/
│   │   ├── preprocessing/           pluggable OpenCV stages + pipeline
│   │   ├── models/                  DefectModel contract, demo heuristic model, PyTorch patch classifier,
│   │   │                            architectures, model cards, factory registry
│   │   ├── inference/               tiling, NMS / tile merging, severity model, health score, annotation
│   │   ├── services/                PreprocessingService, ModelService, PredictionService
│   │   └── training/                SDNET2018 preparation + transfer-learning trainer
│   ├── models/                      mount point for model.pt + model_card.json (git-ignored)
│   └── tests/
├── frontend/                        React application
│   └── src/
│       ├── api/                     axios client (JWT refresh, error normalisation), typed endpoints
│       ├── components/              ui/ (Button, KpiCard, ChartCard, DataTable, Modal, Drawer, Badges…),
│       │                            inspection/ (UploadZone, ImageViewer, BoundingBoxOverlay,
│       │                            ProcessingTimeline, DetectionList), charts/, map/, layout/, …
│       ├── contexts/                Auth, Toast, Realtime (WebSocket), Meta
│       ├── hooks/                   useApi, useInspectionProgress, useDebounce, …
│       ├── layouts/                 AppLayout (sidebar + top bar)
│       ├── pages/                   Landing, Dashboard, Assets, Inspections, AI Analysis, Alerts,
│       │                            Analytics, Map, Models, Architecture, admin/Users, admin/Settings
│       ├── types/, utils/
├── docker/                          backend / ml-worker / frontend Dockerfiles, nginx template, entrypoint
├── docs/                            architecture reference, screenshots
├── docker-compose.yml
├── .env.example
└── .github/workflows/ci.yml
```

## Quick start (Docker)

Requirements: Docker 24+ with Compose v2, ~6 GB free disk (the ML worker image includes CPU PyTorch).

```bash
cp .env.example .env
# edit .env: replace every "change-me" value (DJANGO_SECRET_KEY, POSTGRES_PASSWORD, storage secrets)
docker compose up --build
```

| URL | What |
|---|---|
| http://localhost:8080 | Web application (nginx serving the React build, proxying `/api` and `/ws`) |
| http://localhost:8080/api/docs/ | Swagger UI · `/api/redoc/` ReDoc · `/api/schema/` OpenAPI |
| http://localhost:8080/django-admin/ | Django admin (fallback; the app has its own admin pages) |
| http://localhost:9001 | MinIO console (`MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD`) |

Services started by Compose, with health checks and ordered start-up:

| Service | Role |
|---|---|
| `postgres` | PostgreSQL 16 |
| `redis` | Celery broker/results, cache, Channels layer |
| `minio` | S3-compatible object storage (`pgsty/minio` – upstream MinIO no longer publishes community images; override with `MINIO_IMAGE`) |
| `minio-init` | one-shot: creates the bucket and a least-privilege application user |
| `backend` | Django ASGI API (Uvicorn); runs migrations, `init_storage` and `seed_demo` on start |
| `celery-worker` | `default` queue – image derivatives, alerts |
| `celery-beat` | schedules stalled-task recovery and overdue-inspection alerts |
| `ml-worker` | `inference` queue – OpenCV + PyTorch; mounts `./ml-worker/models` at `/models` |
| `frontend` | nginx with the production React build |

Tips:

- Scale inference: `docker compose up -d --scale ml-worker=3` (each replica serves one task at a time).
- Smaller image for demo-only use: set `INSTALL_PYTORCH=false` in `.env` before building.
- Reset everything including data: `docker compose down -v`.

## Demo credentials

`seed_demo` runs automatically when `SEED_DEMO_DATA=true`. It creates 56 assets across six West-Coast
regions, ~180 inspections over 18 months, ~380 detections, ~200 alerts and a model-registry entry for
the demo detector. All demo users share the password from `DEMO_USER_PASSWORD`
(default **`InfraVision@2026`** – change it for any shared environment).

| Role | Email | Can |
|---|---|---|
| Administrator | `admin@infravision.ai` | everything, incl. users/roles, settings, model registry, hard deletes |
| Engineer | `engineer@infravision.ai` | manage assets, review detections, resolve alerts, re-run AI |
| Inspector | `inspector@infravision.ai` | create inspections, upload imagery, acknowledge alerts |
| Viewer | `viewer@infravision.ai` | read-only |

Additional seeded users: `s.alvarez@infravision.ai` (Inspector), `l.oconnor@infravision.ai` (Engineer).
Self-registration (`ALLOW_SELF_REGISTRATION`) creates Viewer accounts only.

Reseed from scratch: `docker compose exec backend python manage.py seed_demo --reset`.

## Environment variables

All configuration is read from the environment; nothing secret lives in the source tree. The full,
commented list is in [`.env.example`](.env.example). The most important ones:

| Variable | Default | Purpose |
|---|---|---|
| `DJANGO_SECRET_KEY` | – (required unless `DJANGO_DEBUG=true`) | Django signing key |
| `DJANGO_DEBUG` | `false` | Debug mode (never in production) |
| `DJANGO_ALLOWED_HOSTS` / `DJANGO_CSRF_TRUSTED_ORIGINS` | localhost | Host / origin allow-lists |
| `CORS_ALLOWED_ORIGINS` | localhost:5173, :8080 | Browser origins allowed to call the API |
| `DJANGO_SECURE_SSL_REDIRECT`, `DJANGO_SECURE_COOKIES`, `DJANGO_HSTS_*` | `true` when not debug | HTTPS hardening |
| `JWT_SIGNING_KEY`, `JWT_ACCESS_TOKEN_MINUTES`, `JWT_REFRESH_TOKEN_DAYS` | secret key, 15, 7 | Token lifetimes |
| `DATABASE_URL` **or** `POSTGRES_DB/USER/PASSWORD/HOST/PORT` | – | PostgreSQL connection |
| `REDIS_URL` | `redis://localhost:6379/0` | Broker (db 0), results (1), cache (2), Channels (3) |
| `USE_S3` | `false` | `true` = S3/MinIO, `false` = local filesystem (`MEDIA_ROOT`) |
| `AWS_STORAGE_BUCKET_NAME`, `AWS_S3_ENDPOINT_URL`, `AWS_S3_REGION_NAME` | – | Bucket / endpoint (omit endpoint for AWS) |
| `AWS_S3_PUBLIC_ENDPOINT_URL` | endpoint | Host that browsers use for presigned URLs (MinIO: `http://localhost:9000`) |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | – | Storage credentials (use IAM roles on AWS where possible) |
| `MAX_IMAGE_UPLOAD_MB`, `MAX_IMAGES_PER_INSPECTION`, `MAX_IMAGE_PIXELS` | 25, 20, 80 M | Upload limits |
| `INFERENCE_MODE` | `demo` | `demo` or `pytorch` (or a custom registered factory) |
| `MODEL_DIR`, `MODEL_PATH`, `MODEL_CARD_PATH`, `MODEL_DEVICE` | `/models`, `model.pt`, `model_card.json`, `auto` | Trained model location / device |
| `DETECTION_THRESHOLD`, `MODEL_BATCH_SIZE`, `WORKING_MAX_SIDE`, `TILE_STRIDE_RATIO` | 0.55, 32, 2048, 0.5 | Inference tuning |
| `PREPROCESSING_STAGES` | all ten stages | Comma-separated, ordered stage names |
| `INFERENCE_ALLOW_DEMO_FALLBACK` | `false` | Opt-in fallback to demo mode if the trained model fails to load (results are then labelled demo) |
| `INFERENCE_SOFT_TIME_LIMIT`, `INFERENCE_STALL_MINUTES`, `INFERENCE_MAX_RETRIES` | 600, 30, 2 | Worker safety limits |
| `SEED_DEMO_DATA`, `DEMO_USER_PASSWORD` | `true`, `InfraVision@2026` | Demo data |
| `PUBLIC_STORAGE_ORIGIN` | `http://localhost:9000` | Image origin allowed by the nginx Content-Security-Policy |

> Compose reads secrets for every service from `.env` via `env_file`, so exported shell variables
> (for example a developer's real `AWS_ACCESS_KEY_ID`) can never leak into the local MinIO setup.

## Local development without Docker

Prerequisites: Python 3.11, Node 22, PostgreSQL 16, Redis 7 (MinIO optional – the filesystem backend
works for development).

**Backend**

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt -r ../ml-worker/requirements.txt   # ML deps only needed for the worker
export DJANGO_DEBUG=true DJANGO_SECRET_KEY=dev-only-key \
       DATABASE_URL=postgres://infravision:password@localhost:5432/infravision \
       REDIS_URL=redis://localhost:6379/0 USE_S3=false PYTHONPATH=../ml-worker
python manage.py migrate
python manage.py seed_demo
uvicorn config.asgi:application --reload --port 8000        # HTTP + WebSockets
```

**Workers** (same environment, separate terminals)

```bash
celery -A config worker -Q default -n default@%h --loglevel INFO
ML_WORKER_ROLE=inference celery -A config worker -Q inference -n ml@%h --pool=solo --loglevel INFO
celery -A config beat --loglevel INFO
```

**Frontend**

```bash
cd frontend
npm install          # .npmrc enables legacy-peer-deps for the test tooling
npm run dev          # http://localhost:5173 – proxies /api, /ws and /media to :8000
```

Use `VITE_PROXY_TARGET` to point the dev server at another API, or `VITE_API_URL` / `VITE_WS_URL` to call
an API directly (add the origin to `CORS_ALLOWED_ORIGINS`).

## Database & migrations

Migrations are committed under `backend/apps/*/migrations/`. The Docker `backend` container applies
them automatically (`RUN_MIGRATIONS=true`). Manually:

```bash
python manage.py migrate                      # apply
python manage.py makemigrations               # after model changes
python manage.py makemigrations --check       # CI guard: fails if migrations are missing
python manage.py createsuperuser              # email-based login
```

Core models: `StructuralAsset`, `InspectionLog`, `ImageRecord`, `DefectDetection`, `MaintenanceAlert`,
`MLModel`, `User` (roles: Administrator, Engineer, Inspector, Viewer) and the singleton
`PlatformConfiguration` (health thresholds and alert rules edited from **Settings**).

## Object storage (MinIO / S3)

- **Local (Compose):** MinIO at `http://minio:9000` inside the network and `http://localhost:9000` for
  browsers. `minio-init` creates the bucket and an application user with the `readwrite` policy; the
  API never uses the root account.
- **Presigned URLs:** images are private. The API signs short-lived (default 1 h) SigV4 URLs against
  `AWS_S3_PUBLIC_ENDPOINT_URL`, because the signature covers the host the browser uses.
- **AWS S3:** set `USE_S3=true`, `AWS_STORAGE_BUCKET_NAME`, `AWS_S3_REGION_NAME`; leave
  `AWS_S3_ENDPOINT_URL` / `AWS_S3_PUBLIC_ENDPOINT_URL` empty; prefer an instance/task IAM role over
  static keys; keep the bucket private with default encryption; set `PUBLIC_STORAGE_ORIGIN` to
  `https://<bucket>.s3.<region>.amazonaws.com`.
- **Keys:** `inspections/YYYY/MM/<reference>/<uuid>.<ext>` plus `_thumb.jpg`, `_preview.jpg` and
  `_annotated.jpg` derivatives. Deleting image records removes their objects.

## Celery workers

| Queue | Worker | Tasks |
|---|---|---|
| `inference` | `ml-worker` (solo pool, one model per process) | `inspections.run_inference` |
| `default` | `celery-worker` | `inspections.generate_image_derivatives` |
| beat | `celery-beat` | `inspections.recover_stalled_inspections` (10 min), `alerts.flag_overdue_inspections` (daily) |

`run_inference` is idempotent (completed or superseded task IDs are ignored), acknowledges late, retries
storage outages with exponential back-off, enforces soft/hard time limits and always ends in
`COMPLETED` or `FAILED` with a user-readable message. Failed inspections can be retried from the UI.

## Machine-learning module

`ml-worker/infravision_ml` is a standalone package (`pip install -e ml-worker[pytorch]`) with no Django
dependency.

**Preprocessing (`preprocessing/`)** – an ordered list of pluggable stages configured by
`PREPROCESSING_STAGES`:

1. image loading (EXIF-aware decode) · 2. resolution normalisation · 3. noise reduction (bilateral)
4. colour normalisation (gray-world) · 5. lighting correction (illumination flattening)
6. contrast enhancement (CLAHE) · 7. edge enhancement (unsharp mask) · 8. resizing
9. tensor conversion (ImageNet normalisation, sliding-window tiles) · 10. CNN inference

Add a stage by subclassing `PreprocessingStage`, decorating it with `@register_stage` and listing its
name in `PREPROCESSING_STAGES`. Every stage is timed and reported with each inspection.

**Models (`models/`)** – every adapter implements `DefectModel` (`info`, `input_spec`, `load()`,
`predict(ctx)`), returning raw detections in working-image coordinates.

- `HeuristicDemoModel` (`INFERENCE_MODE=demo`) – morphology/HSV heuristics; `is_demo=True`.
- `TorchPatchClassifier` (`INFERENCE_MODE=pytorch`) – a CNN patch classifier (ResNet-50 by default)
  run as a sliding window; adjacent positive patches of the same class are merged into bounding boxes.
  Compatible with SDNET2018-style patch datasets and with multi-class datasets (crack, spalling,
  corrosion, efflorescence, exposed rebar…). Supports state-dict checkpoints and TorchScript.
- Custom adapters (YOLO-style detector, TensorFlow SavedModel, ONNX…) are registered with
  `@register_model("my-mode")` and selected with `INFERENCE_MODE=my-mode` – no Django changes.

**Services (`services/`)** – `PreprocessingService`, `ModelService` (lazy load + metadata) and
`PredictionService` (preprocess → infer → NMS → original coordinates → severity → health → annotation).

**Severity & health (`inference/`)** – severity blends defect-type criticality, physical extent (crack
length or area) and confidence into Low/Medium/High/Critical; the health score applies
confidence-weighted penalties per severity with caps (any critical finding ≤ 58, any high ≤ 72).
Weights live in `SeverityClassifier` / `health.py` and are easy to calibrate per asset class.

## Replacing demo inference with a trained model

1. **Prepare data.** For SDNET2018 (decks/walls/pavements, cracked vs uncracked 256 px patches):

   ```bash
   cd ml-worker && pip install -e ".[pytorch]"
   python -m infravision_ml.training.prepare_sdnet2018 --source /data/SDNET2018 --output /data/sdnet-split
   ```

   Any `ImageFolder` layout works (`train/<class>/*.jpg`, `val/<class>/*.jpg`). Class folder names are
   mapped to the platform taxonomy (`crack`, `spalling`, `corrosion`, `rust`, `efflorescence`,
   `exposed_rebar`, …); `no_defect` / `uncracked` / `background` are treated as background.

2. **Train with transfer learning** (ImageNet weights, head-only warm-up then full fine-tuning,
   class-weighted loss for imbalance, best checkpoint by macro-F1):

   ```bash
   python -m infravision_ml.training.train_patch_classifier \
       --data-dir /data/sdnet-split --arch resnet50 --epochs 12 --freeze-epochs 2 \
       --output-dir ./models --name "InfraVision CrackNet" --version 1.0.0
   ```

   This writes `models/model.pt`, `models/model_card.json` (classes, architecture, input size,
   normalisation, validation accuracy/precision/recall/F1) and `training_history.json`.
   Other backbones: `--arch efficientnet_b0 | mobilenet_v3_large | resnet18 | timm:xception65`.

3. **Deploy.** Copy both files into `ml-worker/models/` (mounted at `/models`), set
   `INFERENCE_MODE=pytorch` (optionally `MODEL_DEVICE=cuda`) in `.env` and restart:
   `docker compose up -d ml-worker`.

4. **Verify.** The worker registers the model on start-up: **AI Models** shows it as *Active* with its
   validation metrics, the demo entry becomes *Inactive*, and new inspections carry
   `inference_mode = production` (no demo badge). Use **Re-run analysis** on older inspections to
   re-process them with the new model.

If the checkpoint cannot be loaded the worker fails loudly (inspections fail with a clear message);
it only falls back to the demo detector when `INFERENCE_ALLOW_DEMO_FALLBACK=true`, and those results
are labelled demo.

## API documentation

Interactive docs: `/api/docs/` (Swagger UI), `/api/redoc/`, schema at `/api/schema/`. All endpoints
except login/refresh/register/health require `Authorization: Bearer <access token>`.

| Method | Endpoint | Description | Role |
|---|---|---|---|
| POST | `/api/auth/login/` | Email + password → `{access, refresh, user}` | public |
| POST | `/api/auth/refresh/` | Rotate refresh token → new pair | public |
| POST | `/api/auth/logout/` | Blacklist refresh token | any |
| POST | `/api/auth/register/` | Self-registration (Viewer) | public |
| GET/PATCH | `/api/auth/me/` · POST `/api/auth/change-password/` | Profile | any |
| GET/POST | `/api/assets/` | List (search, filters, ordering, pagination) / create | read: any · write: Engineer |
| GET/PUT/PATCH/DELETE | `/api/assets/{id}/` | Detail / update / delete | Engineer · delete: Admin |
| POST | `/api/assets/{id}/archive/` · `/restore/` | Archive or restore | Engineer |
| GET | `/api/assets/map/` · `/options/` | Map markers · selector options | any |
| GET | `/api/assets/{id}/health-history/` · `/risk-analysis/` · `/defect-summary/` | Asset intelligence | any |
| GET/POST | `/api/inspections/` | List (filters: asset, status, severity, type, dates, inference mode) / create | create: Inspector |
| GET/PATCH/DELETE | `/api/inspections/{id}/` | Detail / edit notes / delete | Inspector · delete: Admin |
| POST | `/api/images/upload/` | Multipart `inspection`, `file` → stored image | Inspector |
| DELETE | `/api/images/{id}/` | Remove image before submission | Inspector |
| POST | `/api/inspections/{id}/submit/` · `/retry/` · `/reprocess/` | Queue AI processing (202) | Inspector · reprocess: Engineer |
| GET | `/api/inspections/{id}/status/` | Lightweight status for polling | any |
| GET | `/api/inspections/{id}/results/` | Full AI analysis (images, detections, summary, distributions, model) | any |
| GET | `/api/inspections/queue/` | Processing queue overview | any |
| GET/PATCH | `/api/detections/` · `/api/detections/{id}/` | Fleet-wide detections · review (confirm/reject) | review: Engineer |
| GET | `/api/alerts/` · `/api/alerts/summary/` | Alerts (status, severity, type, asset, search) | any |
| PATCH | `/api/alerts/{id}/` | `status`, `resolution_notes`, `assigned_to` | Inspector (investigating) · Engineer |
| GET | `/api/dashboard/` | Executive dashboard payload (cached, invalidated on completion) | any |
| GET | `/api/analytics/` | Analytics datasets (`date_from`, `date_to`, `asset`, `asset_type`, `defect_type`, `severity`) | any |
| GET/PATCH | `/api/models/` · `/api/models/active/` · `/api/models/{id}/` | Model registry | edit: Admin |
| GET/POST/PATCH/DELETE | `/api/users/` · `/api/users/summary/` | User & role administration (delete = deactivate) | Admin |
| GET/PATCH | `/api/settings/` | Platform configuration | edit: Admin |
| GET | `/api/meta/` | Enumerations and upload limits | any |
| GET | `/api/health/` (`?deep=1` checks storage) | Liveness/readiness | public |

Errors share one shape: `{"detail": "Human readable message", "code": "machine_code", "errors": {field: [..]}}`
(e.g. `validation_error`, `invalid_state` (409), `storage_unavailable` (503), `service_unavailable`).

```bash
TOKEN=$(curl -s -X POST localhost:8080/api/auth/login/ -H 'Content-Type: application/json' \
  -d '{"email":"inspector@infravision.ai","password":"InfraVision@2026"}' | jq -r .access)
ID=$(curl -s -X POST localhost:8080/api/inspections/ -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d '{"structural_asset":1,"inspection_type":"DRONE"}' | jq .id)
curl -s -X POST localhost:8080/api/images/upload/ -H "Authorization: Bearer $TOKEN" -F inspection=$ID -F file=@deck.jpg
curl -s -X POST localhost:8080/api/inspections/$ID/submit/ -H "Authorization: Bearer $TOKEN"
curl -s localhost:8080/api/inspections/$ID/results/ -H "Authorization: Bearer $TOKEN"
```

## Real-time updates

`ws(s)://<host>/ws/inspections/?token=<access token>` (Django Channels, Redis channel layer). Events:

```json
{"type": "inspection.update", "kind": "completed", "level": "warning",
 "message": "Inspection INS-2048 completed — 4 structural anomalies detected.",
 "inspection": {"id": 1048, "reference": "INS-2048", "status": "COMPLETED", "processing_stage": "COMPLETED", "defect_count": 4, "...": "..."}}
{"type": "alert.created", "alert": {"reference": "ALR-701", "severity": "CRITICAL", "...": "..."}, "message": "..."}
```

`kind` is `queued | started | stage | completed | failed`. The client reconnects with exponential
back-off and switches to polling (`/status/` every 2.5 s) while disconnected; the top bar shows
**Live / Connecting / Polling**.

## Security

- JWT access tokens (15 min) with rotating, blacklisted refresh tokens; logout blacklists server-side.
- Role-based permissions on every endpoint and route (`apps/users/permissions.py`), hierarchical roles.
- Argon2 password hashing, Django password validators (min. 10 chars), auth-endpoint rate limiting.
- Upload validation: extension allow-list, size limit, Pillow verification, minimum dimensions,
  decompression-bomb limit; files are stored under random keys, never executed or served from the app.
- Private bucket, short-lived presigned URLs, least-privilege MinIO user.
- Production settings when `DJANGO_DEBUG=false`: HTTPS redirect, HSTS, secure cookies, `X-Frame-Options: DENY`,
  `nosniff`, strict referrer policy, CORS allow-list; nginx adds a Content-Security-Policy.
- Secrets only via environment; `.env` is git-ignored. `python manage.py check --deploy` runs in CI.
- Tokens are held in `localStorage` for session persistence – keep the CSP strict and dependencies
  patched; move to httpOnly cookies if your threat model requires it.

## Testing

```bash
# Backend (SQLite by default; set TEST_DATABASE_URL to use PostgreSQL). Includes the full
# upload → queue → inference → alerts pipeline (eager Celery + demo model), WebSockets and RBAC.
cd backend && pip install -r requirements-dev.txt -r ../ml-worker/requirements.txt && pytest

# ML package (preprocessing, severity/health, demo detector accuracy on synthetic defects,
# and — if PyTorch is installed — train → load via model card → sliding-window inference).
cd ml-worker && pip install -r requirements.txt -r requirements-pytorch.txt pytest && pytest

# Frontend (Vitest + Testing Library), typecheck and production build
cd frontend && npm ci && npm test && npm run typecheck && npm run build
```

GitHub Actions (`.github/workflows/ci.yml`) runs all of the above (backend against PostgreSQL), checks
for missing migrations, runs `check --deploy` and validates the Compose file.

## Production deployment

- **Images:** build the three images from `docker/` and push them to your registry. Run the API with
  several Uvicorn workers behind a TLS-terminating load balancer/ingress; nginx (frontend image) or a
  CDN serves the static React build.
- **Configuration:** `DJANGO_DEBUG=false`, a strong `DJANGO_SECRET_KEY` (and optionally a separate
  `JWT_SIGNING_KEY`), exact `DJANGO_ALLOWED_HOSTS` / `CSRF_TRUSTED_ORIGINS` / `CORS_ALLOWED_ORIGINS`,
  `DJANGO_SECURE_SSL_REDIRECT=true`, `DJANGO_SECURE_COOKIES=true`, `ALLOW_SELF_REGISTRATION` as
  appropriate, `SEED_DEMO_DATA=false`. Load secrets from a secret manager.
- **Data services:** managed PostgreSQL (backups, PITR), managed Redis (e.g. ElastiCache) and S3 with
  bucket encryption, versioning and lifecycle rules; IAM roles instead of static keys.
- **Migrations:** run `python manage.py migrate` as a one-off release job before rolling out new API
  pods (set `RUN_MIGRATIONS=false` on long-running replicas).
- **Workers:** scale `ml-worker` horizontally (GPU nodes with `MODEL_DEVICE=cuda` and a CUDA PyTorch
  build), run exactly one `celery-beat`, and monitor queue depth (e.g. Flower or Prometheus exporters).
- **Models:** mount versioned `model.pt` + `model_card.json` from object storage or a model registry;
  roll out by restarting the ML worker – the registry records what is serving.
- **Observability:** container logs are structured one-line records; `/api/health/?deep=1` checks
  database, cache and storage for readiness probes; the ML worker has a Celery ping health check.

---

InfraVision AI provides decision support. AI findings and system-generated risk analyses must be
verified by qualified engineers before maintenance or safety decisions are made.
