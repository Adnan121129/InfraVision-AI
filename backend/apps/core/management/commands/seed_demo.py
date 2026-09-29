"""Populate the platform with realistic, clearly-labelled demo data.

    python manage.py seed_demo            # idempotent: skips if demo assets exist
    python manage.py seed_demo --reset    # wipe assets/inspections/alerts and reseed

Every seeded inspection is marked ``inference_mode="demo"`` and attributed to
the demo heuristic detector, so the UI shows a "Demo inference" badge. Imagery
is synthetic (procedurally generated) - no real structure is depicted.
"""

from __future__ import annotations

import math
import random
from datetime import date, timedelta
from decimal import Decimal

from django.conf import settings
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from apps.alerts.models import AlertStatus, MaintenanceAlert
from apps.alerts.services import create_alerts_for_inspection, flag_overdue_assets
from apps.assets.models import AssetType, MaterialType, StructuralAsset
from apps.assets.services import refresh_asset_health
from apps.core.demo_imagery import generate_pool, thumbnail
from apps.core.models import PlatformConfiguration
from apps.core.storage import ensure_bucket, object_storage
from apps.inspections.models import (
    DefectDetection,
    DefectType,
    ImageRecord,
    InspectionLog,
    InspectionStatus,
    InspectionType,
    ProcessingStage,
)
from apps.ml.models import Framework, MLModel, ModelStatus
from apps.users.models import Role, User

DEMO_MODEL_NAME = "InfraVision Demo Detector"
DEMO_MODEL_VERSION = "0.4.0-demo"

DEMO_USERS = [
    ("admin@infravision.ai", "Amelia", "Hart", Role.ADMINISTRATOR, "Platform Administrator"),
    ("engineer@infravision.ai", "Daniel", "Okafor", Role.ENGINEER, "Senior Structural Engineer"),
    ("inspector@infravision.ai", "Priya", "Raman", Role.INSPECTOR, "Field Inspection Lead"),
    ("viewer@infravision.ai", "Marcus", "Chen", Role.VIEWER, "Asset Planning Analyst"),
    ("s.alvarez@infravision.ai", "Sofia", "Alvarez", Role.INSPECTOR, "Drone Survey Specialist"),
    ("l.oconnor@infravision.ai", "Liam", "O'Connor", Role.ENGINEER, "Bridge Engineer"),
]

REGIONS = [
    ("Puget Sound", "Seattle, WA", 47.61, -122.30),
    ("Columbia Corridor", "Portland, OR", 45.52, -122.62),
    ("Bay Area", "Oakland, CA", 37.80, -122.22),
    ("Central Valley", "Sacramento, CA", 38.58, -121.45),
    ("Southland", "Los Angeles, CA", 34.05, -118.20),
    ("Border Region", "San Diego, CA", 32.75, -117.05),
]

NAME_PARTS = {
    AssetType.BRIDGE: (["Cedar Creek", "Harbor Point", "Millrace", "Kestrel River", "Stonegate", "Riverside", "Willow Bend", "Northfork", "Granite Falls", "Bayshore", "Elk Hollow", "Copper Canyon", "Silver Lake", "Ironwood", "Maple Run", "Sandpiper"], ["Bridge", "Viaduct", "Overpass", "Crossing"]),
    AssetType.ROAD: (["Route 9", "Summit Pass", "Coastal Highway", "Airport Connector", "Industrial Loop", "Ridge Road", "Valley Parkway", "Harbor Freeway", "Canal Street"], ["Segment {n}", "Pavement Section {n}", "Carriageway {n}"]),
    AssetType.BUILDING: (["Mill Street", "Civic Center", "Eastgate", "Terminal 2", "Lakeside", "Union Station", "Pioneer Square", "Westfield", "Harborview"], ["Parking Structure", "Transit Hub", "Office Block", "Maintenance Depot"]),
    AssetType.TUNNEL: (["North Ridge", "Cascade", "Hillcrest", "Sierra Vista", "Bayview"], ["Tunnel", "Rail Tunnel", "Road Tunnel"]),
    AssetType.TOWER: (["Eastgate", "Pine Hill", "Mesa", "Clearwater", "Signal Peak", "Oakridge"], ["Water Tower", "Transmission Tower", "Telecom Mast"]),
    AssetType.DAM: (["Upper Fork", "Lake Marian", "Coyote Creek"], ["Dam", "Spillway"]),
    AssetType.INDUSTRIAL: (["Kestrel Refinery", "Portside Terminal", "Northgate Power", "Delta Chemical", "Riverside Water Works", "Harbor Grain"], ["Pipe Rack B", "Cooling Tower", "Loading Gantry", "Storage Silo", "Conveyor Gallery"]),
    AssetType.OTHER: (["Pier 7", "Marina"], ["Wharf Deck", "Retaining Wall"]),
}

TYPE_COUNTS = {
    AssetType.BRIDGE: 16,
    AssetType.ROAD: 9,
    AssetType.BUILDING: 9,
    AssetType.TUNNEL: 5,
    AssetType.TOWER: 6,
    AssetType.DAM: 3,
    AssetType.INDUSTRIAL: 6,
    AssetType.OTHER: 2,
}

MATERIALS = {
    AssetType.BRIDGE: [MaterialType.REINFORCED_CONCRETE, MaterialType.PRESTRESSED_CONCRETE, MaterialType.STRUCTURAL_STEEL, MaterialType.COMPOSITE],
    AssetType.ROAD: [MaterialType.ASPHALT, MaterialType.ASPHALT, MaterialType.REINFORCED_CONCRETE],
    AssetType.BUILDING: [MaterialType.REINFORCED_CONCRETE, MaterialType.MASONRY, MaterialType.STRUCTURAL_STEEL],
    AssetType.TUNNEL: [MaterialType.REINFORCED_CONCRETE, MaterialType.MASONRY],
    AssetType.TOWER: [MaterialType.STRUCTURAL_STEEL, MaterialType.REINFORCED_CONCRETE],
    AssetType.DAM: [MaterialType.REINFORCED_CONCRETE],
    AssetType.INDUSTRIAL: [MaterialType.STRUCTURAL_STEEL, MaterialType.REINFORCED_CONCRETE],
    AssetType.OTHER: [MaterialType.REINFORCED_CONCRETE, MaterialType.TIMBER],
}

SYSTEMS = {
    AssetType.BRIDGE: ["Box girder", "Steel plate girder", "Prestressed I-girder", "Cable-stayed", "Steel truss", "Concrete arch"],
    AssetType.ROAD: ["Flexible pavement", "Jointed plain concrete pavement"],
    AssetType.BUILDING: ["Flat-slab frame", "Moment frame", "Load-bearing masonry"],
    AssetType.TUNNEL: ["Cut-and-cover box", "Segmental lining", "Masonry arch lining"],
    AssetType.TOWER: ["Lattice tower", "Elevated tank on column"],
    AssetType.DAM: ["Concrete gravity", "Arch dam"],
    AssetType.INDUSTRIAL: ["Braced steel frame", "Portal frame", "Slip-formed silo"],
    AssetType.OTHER: ["Pile-supported deck", "Cantilever wall"],
}

SURFACE_FOR_MATERIAL = {
    MaterialType.STRUCTURAL_STEEL: "steel",
    MaterialType.ASPHALT: "asphalt",
    MaterialType.MASONRY: "masonry",
}

SEVERITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"]
BASE_SEVERITY = {"CRACK": 1, "SPALLING": 2, "EXPOSED_REBAR": 3, "CORROSION": 2, "RUST": 1, "EFFLORESCENCE": 0, "SURFACE_DAMAGE": 0}
PENALTY = {"LOW": 2.0, "MEDIUM": 5.5, "HIGH": 11.0, "CRITICAL": 22.0}
CAP = {"CRITICAL": 58.0, "HIGH": 72.0}

PIPELINE_STAGES = [
    ("image_loading", "Image loading"),
    ("resolution_normalization", "Resolution normalization"),
    ("noise_reduction", "Noise reduction"),
    ("color_normalization", "Color normalization"),
    ("lighting_correction", "Lighting correction"),
    ("contrast_enhancement", "Contrast enhancement"),
    ("edge_enhancement", "Edge enhancement"),
    ("resizing", "Image resizing"),
    ("tensor_conversion", "Tensor conversion"),
    ("model_inference", "Heuristic inference (demo)"),
    ("postprocessing", "Defect analysis & severity scoring"),
]


def health_from(detections: list[dict]) -> float:
    """Same scoring rule as ``infravision_ml.inference.health``."""
    penalty, cap = 0.0, 100.0
    for det in detections:
        penalty += PENALTY[det["severity"]] * (0.5 + 0.5 * det["confidence"])
        cap = min(cap, CAP.get(det["severity"], 100.0))
    return round(max(0.0, min(100.0 * math.exp(-penalty / 90.0), cap)), 1)


class Command(BaseCommand):
    help = "Seed realistic demo data (assets, inspections, detections, alerts). All AI results are flagged as demo."

    def add_arguments(self, parser):
        parser.add_argument("--reset", action="store_true", help="Delete existing assets, inspections and alerts first")
        parser.add_argument("--seed", type=int, default=42)
        parser.add_argument("--password", default=None, help="Password for demo users (default: DEMO_USER_PASSWORD env or InfraVision@2026)")

    def handle(self, *args, **options):
        import os

        rnd = random.Random(options["seed"])
        password = options["password"] or os.environ.get("DEMO_USER_PASSWORD") or "InfraVision@2026"

        if options["reset"]:
            self.stdout.write("Removing existing assets, inspections and alerts…")
            MaintenanceAlert.objects.all().delete()
            InspectionLog.objects.all().delete()
            StructuralAsset.objects.all().delete()
        elif StructuralAsset.objects.exists():
            self.stdout.write(self.style.WARNING("Assets already exist - skipping (use --reset to reseed)."))
            self._ensure_users(password)
            return

        ensure_bucket()
        users = self._ensure_users(password)
        PlatformConfiguration.load()
        model = self._ensure_model()
        pool = self._upload_pool()
        with transaction.atomic():
            assets = self._create_assets(rnd, users)
            count = self._create_inspections(rnd, assets, users, pool, model)
            self._close_superseded_alerts(rnd, assets, users)
            self._age_alerts(rnd, users)
        for asset in assets:
            refresh_asset_health(asset)
        flag_overdue_assets()
        for asset in assets:
            refresh_asset_health(asset)  # risk levels account for the overdue alerts

        self.stdout.write(
            self.style.SUCCESS(
                f"Seeded {len(assets)} assets, {count} inspections, {DefectDetection.objects.count()} detections, "
                f"{MaintenanceAlert.objects.count()} alerts. Demo users share the password '{password}'."
            )
        )

    # ------------------------------------------------------------------
    def _ensure_users(self, password: str) -> dict[str, list[User]]:
        by_role: dict[str, list[User]] = {}
        for email, first, last, role, title in DEMO_USERS:
            user, created = User.objects.get_or_create(
                email=email,
                defaults={"username": email.split("@")[0].replace(".", "_"), "first_name": first, "last_name": last, "role": role, "job_title": title, "organization": "InfraVision Demo Operations"},
            )
            if created:
                user.set_password(password)
                if role == Role.ADMINISTRATOR:
                    user.is_staff = True
                    user.is_superuser = True
                user.save()
            by_role.setdefault(role, []).append(user)
        return by_role

    def _ensure_model(self) -> MLModel:
        model, _ = MLModel.objects.update_or_create(
            model_name=DEMO_MODEL_NAME,
            version=DEMO_MODEL_VERSION,
            defaults={
                "framework": Framework.OPENCV,
                "architecture": "Classical CV heuristics (morphology + HSV segmentation) — not a trained model",
                "description": "Deterministic OpenCV heuristics used when no trained model is deployed. Outputs are demo results.",
                "is_demo": True,
                "classes": ["CRACK", "SPALLING", "CORROSION", "RUST", "EFFLORESCENCE"],
                "status": ModelStatus.ACTIVE,
                "deployed_at": timezone.now() - timedelta(days=420),
                "last_heartbeat_at": timezone.now(),
            },
        )
        return model

    def _upload_pool(self):
        self.stdout.write("Generating synthetic inspection imagery…")
        pool = generate_pool()
        for item in pool:
            base = item.key.rsplit(".", 1)[0]
            item.thumb_key = f"{base}_thumb.jpg"
            if not object_storage.exists(item.key):
                object_storage.save(item.key, item.content, "image/jpeg")
            if not object_storage.exists(item.thumb_key):
                object_storage.save(item.thumb_key, thumbnail(item.content, settings.IMAGE_THUMBNAIL_SIZE), "image/jpeg")
        return pool

    def _create_assets(self, rnd: random.Random, users) -> list[StructuralAsset]:
        assets = []
        used_names: set[str] = set()
        creator = users[Role.ENGINEER][0]
        for asset_type, count in TYPE_COUNTS.items():
            prefixes, suffixes = NAME_PARTS[asset_type]
            for _ in range(count):
                while True:
                    name = f"{rnd.choice(prefixes)} {rnd.choice(suffixes).format(n=rnd.randint(2, 28))}"
                    if name not in used_names:
                        used_names.add(name)
                        break
                region, city, lat, lng = rnd.choice(REGIONS)
                material = rnd.choice(MATERIALS[asset_type])
                installed = date(rnd.randint(1958, 2019), rnd.randint(1, 12), rnd.randint(1, 28))
                criticality = rnd.random()
                assets.append(
                    StructuralAsset.objects.create(
                        asset_name=name,
                        asset_type=asset_type,
                        material_type=material,
                        description=f"{AssetType(asset_type).label} asset in the {region} network. Demo record.",
                        latitude=Decimal(f"{lat + rnd.uniform(-0.16, 0.16):.6f}"),
                        longitude=Decimal(f"{lng + rnd.uniform(0.0, 0.3):.6f}"),
                        location=city,
                        region=region,
                        installation_date=installed,
                        structural_system=rnd.choice(SYSTEMS[asset_type]),
                        dimensions=self._dimensions(rnd, asset_type),
                        operator=rnd.choice(["Metro Transport Authority", "State DOT District 4", "Regional Water Board", "Port Authority", "Private operator"]),
                        inspection_interval_days=90 if criticality > 0.8 else 180 if criticality > 0.35 else 365,
                        created_by=creator,
                    )
                )
        StructuralAsset.objects.filter(pk__in=[a.pk for a in assets]).update(created_at=timezone.now() - timedelta(days=560))
        return assets

    @staticmethod
    def _dimensions(rnd: random.Random, asset_type: str) -> str:
        if asset_type == AssetType.BRIDGE:
            return f"{rnd.randint(60, 1400)} m span, {rnd.randint(2, 8)} lanes"
        if asset_type == AssetType.ROAD:
            return f"{rnd.uniform(0.8, 12):.1f} km, {rnd.randint(2, 6)} lanes"
        if asset_type == AssetType.TUNNEL:
            return f"{rnd.randint(300, 4200)} m bore, {rnd.choice([9, 11, 13])} m diameter"
        if asset_type == AssetType.TOWER:
            return f"{rnd.randint(25, 120)} m height"
        if asset_type == AssetType.DAM:
            return f"{rnd.randint(30, 140)} m height, {rnd.randint(200, 900)} m crest"
        return f"{rnd.randint(4, 30)} storeys / {rnd.randint(2, 40) * 1000} m²"

    def _create_inspections(self, rnd, assets, users, pool, model) -> int:
        now = timezone.now()
        inspectors = users[Role.INSPECTOR] + users[Role.ENGINEER]
        created = 0
        for asset in assets:
            surface = SURFACE_FOR_MATERIAL.get(asset.material_type, "concrete")
            candidates = [p for p in pool if p.surface == surface] or [p for p in pool if p.surface == "concrete"]
            profile = rnd.random()
            start = rnd.uniform(90, 99) if profile < 0.6 else rnd.uniform(78, 92)
            decline = rnd.uniform(0.1, 0.7) if profile < 0.55 else rnd.uniform(1.2, 2.2) if profile < 0.8 else rnd.uniform(2.4, 3.6)
            n = rnd.choice([2, 3, 3, 3, 4, 4])
            latest = rnd.randint(0, 150) if rnd.random() < 0.85 else rnd.randint(150, 420)
            earlier = [rnd.randint(latest + 30, 540) for _ in range(n - 1)]
            days_ago = sorted(set(earlier + [latest]), reverse=True)
            repaired_after = rnd.choice([None, None, None, 1, 2]) if n > 2 else None
            previous_score = None

            for index, ago in enumerate(days_ago):
                months = (540 - ago) / 30
                target = start - decline * months
                if repaired_after is not None and index > repaired_after:
                    target += rnd.uniform(12, 22)
                target = max(18.0, min(99.0, target + rnd.uniform(-3, 3)))
                when = now - timedelta(days=ago, hours=rnd.randint(1, 9), minutes=rnd.randint(0, 59))
                inspection = InspectionLog.objects.create(
                    structural_asset=asset,
                    inspection_date=when,
                    inspection_type=rnd.choice([InspectionType.ROUTINE, InspectionType.DRONE, InspectionType.DRONE, InspectionType.FIXED_CAMERA, InspectionType.DETAILED]),
                    inspector=rnd.choice(inspectors),
                    notes="Seeded demo inspection (synthetic imagery, demo inference).",
                )
                failed = rnd.random() < 0.025
                images = self._attach_images(rnd, inspection, candidates, target)
                if failed:
                    InspectionLog.objects.filter(pk=inspection.pk).update(
                        status=InspectionStatus.FAILED,
                        processing_stage=ProcessingStage.FAILED,
                        error_message="Demo record: image decode failed (truncated JPEG from drone uplink). Retry the inspection.",
                        created_at=when,
                        updated_at=when + timedelta(minutes=2),
                        queued_at=when,
                    )
                    created += 1
                    continue
                detections = self._detections(rnd, inspection, images, target)
                score = health_from(detections)
                self._complete(rnd, inspection, detections, score, model, when, len(images))
                inspection.refresh_from_db()
                alerts = create_alerts_for_inspection(inspection, previous_score)
                MaintenanceAlert.objects.filter(pk__in=[a.pk for a in alerts]).update(created_at=when + timedelta(minutes=4))
                asset.current_health_score = score
                previous_score = score
                created += 1
        return created

    def _attach_images(self, rnd, inspection, candidates, target) -> list[tuple[ImageRecord, object]]:
        by_defects = sorted(candidates, key=lambda p: len(p.defects))
        if target >= 80:
            choices = by_defects[: max(2, len(by_defects) // 2)]
        elif target >= 60:
            choices = by_defects[len(by_defects) // 4 :]
        else:
            choices = by_defects[len(by_defects) // 2 :]
        picked = rnd.sample(choices, k=min(len(choices), rnd.choice([1, 1, 2])))
        records = []
        for item in picked:
            record = ImageRecord.objects.create(
                inspection=inspection,
                image_url=object_storage.uri(item.key),
                storage_key=item.key,
                thumbnail_key=item.thumb_key,
                preview_key=item.key,
                original_filename=f"{inspection.reference}_{item.key.rsplit('/', 1)[-1]}",
                content_type="image/jpeg",
                file_size=len(item.content),
                image_width=item.width,
                image_height=item.height,
                checksum="",
            )
            records.append((record, item))
        return records

    def _detections(self, rnd, inspection, images, target) -> list[dict]:
        escalation = 0 if target >= 82 else 1 if target >= 62 else 2
        rows = []
        for record, item in images:
            for defect in item.defects:
                level = BASE_SEVERITY.get(defect.defect_type, 1) + escalation + (1 if defect.size_hint > 0.7 else 0) - 1
                if rnd.random() < 0.2:
                    level += rnd.choice([-1, 1])
                severity = SEVERITIES[max(0, min(3, level))]
                confidence = round(rnd.uniform(0.66, 0.97), 4)
                x0, y0, x1, y1 = defect.bbox
                jitter = lambda v, hi: max(0, min(hi, v + rnd.randint(-6, 6)))  # noqa: E731
                box = (jitter(x0, item.width), jitter(y0, item.height), jitter(x1, item.width), jitter(y1, item.height))
                area_ratio = (box[2] - box[0]) * (box[3] - box[1]) / float(item.width * item.height)
                label = DefectType(defect.defect_type).label
                rows.append(
                    {
                        "record": record,
                        "defect_type": defect.defect_type,
                        "severity": severity,
                        "confidence": confidence,
                        "box": box,
                        "area_ratio": area_ratio,
                        "description": f"{label} covering {area_ratio:.1%} of the frame; rated {severity.lower()} (demo detection).",
                    }
                )
        return rows

    def _complete(self, rnd, inspection, detections, score, model, when, image_count):
        config = PlatformConfiguration.load()
        DefectDetection.objects.bulk_create(
            [
                DefectDetection(
                    inspection=inspection,
                    image_record=d["record"],
                    defect_type=d["defect_type"],
                    severity=d["severity"],
                    confidence_score=d["confidence"],
                    x_min=d["box"][0],
                    y_min=d["box"][1],
                    x_max=d["box"][2],
                    y_max=d["box"][3],
                    area_ratio=round(d["area_ratio"], 5),
                    description=d["description"],
                )
                for d in detections
            ]
        )
        by_image: dict[int, list[dict]] = {}
        for d in detections:
            by_image.setdefault(d["record"].pk, []).append(d)
        for record_id, dets in by_image.items():
            ImageRecord.objects.filter(pk=record_id).update(health_score=health_from(dets))
        ImageRecord.objects.filter(inspection=inspection, health_score__isnull=True).update(health_score=100.0)

        processing = round(rnd.uniform(0.9, 2.4) * image_count + rnd.uniform(0.2, 0.8), 3)
        report = []
        for name, label in PIPELINE_STAGES:
            skipped = name in ("resizing", "tensor_conversion")
            report.append(
                {
                    "name": name,
                    "label": label,
                    "status": "skipped" if skipped else "completed",
                    "duration_ms": 0.0 if skipped else round(rnd.uniform(4, 240) * image_count, 2),
                    "details": {"reason": "Model consumes the enhanced image directly"} if skipped else {},
                }
            )
        severity_counts = {s: sum(1 for d in detections if d["severity"] == s) for s in SEVERITIES}
        max_sev = next((s for s in reversed(SEVERITIES) if severity_counts[s]), None)
        confidences = [d["confidence"] for d in detections]
        InspectionLog.objects.filter(pk=inspection.pk).update(
            status=InspectionStatus.COMPLETED,
            processing_stage=ProcessingStage.COMPLETED,
            overall_health_score=score,
            health_status=config.health_status_for(score),
            defect_count=len(detections),
            max_severity=max_sev,
            processing_time=processing,
            model_version=f"{model.model_name} {model.version}",
            ml_model=model,
            inference_mode="demo",
            preprocessing_report=report,
            summary={
                "severity_counts": severity_counts,
                "type_counts": {t: sum(1 for d in detections if d["defect_type"] == t) for t in {d["defect_type"] for d in detections}},
                "images_processed": image_count,
                "avg_confidence": round(sum(confidences) / len(confidences), 4) if confidences else None,
                "timings_ms": {"total_ms": processing * 1000},
                "demo_seed": True,
            },
            celery_task_id="",
            attempts=1,
            queued_at=when,
            started_at=when + timedelta(seconds=rnd.randint(2, 40)),
            completed_at=when + timedelta(seconds=rnd.randint(45, 120)),
            created_at=when,
            updated_at=when + timedelta(minutes=2),
        )

    def _close_superseded_alerts(self, rnd, assets, users):
        """A clean follow-up inspection implies earlier findings were repaired."""
        engineers = users[Role.ENGINEER]
        for asset in assets:
            latest = (
                InspectionLog.objects.filter(structural_asset=asset, status=InspectionStatus.COMPLETED)
                .order_by("-inspection_date")
                .first()
            )
            if latest is None or (latest.overall_health_score or 0) < 80:
                continue
            for alert in MaintenanceAlert.objects.filter(structural_asset=asset, created_at__lt=latest.inspection_date).exclude(status=AlertStatus.RESOLVED):
                resolved = min(alert.created_at + timedelta(days=rnd.randint(3, 25)), latest.inspection_date)
                MaintenanceAlert.objects.filter(pk=alert.pk).update(
                    status=AlertStatus.RESOLVED,
                    resolved_at=resolved,
                    resolved_by=rnd.choice(engineers),
                    assigned_to=rnd.choice(engineers),
                    resolution_notes=f"Repair completed; follow-up inspection {latest.reference} confirmed the condition.",
                )

    def _age_alerts(self, rnd, users):
        now = timezone.now()
        engineers = users[Role.ENGINEER]
        for alert in MaintenanceAlert.objects.all():
            age = (now - alert.created_at).days
            roll = rnd.random()
            if age > 45 and roll < 0.75:
                resolved = alert.created_at + timedelta(days=rnd.randint(2, 30), hours=rnd.randint(0, 20))
                MaintenanceAlert.objects.filter(pk=alert.pk).update(
                    status=AlertStatus.RESOLVED,
                    resolved_at=min(resolved, now),
                    resolved_by=rnd.choice(engineers),
                    resolution_notes=rnd.choice(
                        [
                            "Verified on site; epoxy injection completed.",
                            "Patch repair carried out with polymer-modified mortar.",
                            "Coating system reinstated after blast cleaning.",
                            "Monitored - no progression since previous inspection.",
                            "Drainage outlet cleared; staining source removed.",
                        ]
                    ),
                    assigned_to=rnd.choice(engineers),
                )
            elif roll < 0.4:
                MaintenanceAlert.objects.filter(pk=alert.pk).update(status=AlertStatus.INVESTIGATING, assigned_to=rnd.choice(engineers))
