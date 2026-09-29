from __future__ import annotations

from datetime import timedelta

from django.db.models import Case, Count, F, OuterRef, Q, Subquery, When
from django.utils import timezone
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import mixins, parsers, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.users.models import Role
from apps.users.permissions import IsInspector, RoleBasedAccess

from . import services
from .filters import DefectDetectionFilter, InspectionFilter
from .models import DefectDetection, ImageRecord, InspectionLog, InspectionStatus, ReviewStatus
from .serializers import (
    DefectDetectionSerializer,
    DefectExplorerSerializer,
    DetectionReviewSerializer,
    ImageRecordSerializer,
    ImageUploadSerializer,
    InspectionCreateSerializer,
    InspectionDetailSerializer,
    InspectionListSerializer,
    InspectionStatusSerializer,
    InspectionUpdateSerializer,
)


def _first_thumbnail_subquery():
    return Subquery(
        ImageRecord.objects.filter(inspection=OuterRef("pk"))
        .order_by("uploaded_at", "id")
        .annotate(best_key=Case(When(thumbnail_key="", then=F("storage_key")), default=F("thumbnail_key")))
        .values("best_key")[:1]
    )


class InspectionViewSet(viewsets.ModelViewSet):
    """AI inspections: create, upload imagery, queue for inference and read results."""

    permission_classes = (RoleBasedAccess,)
    create_role = Role.INSPECTOR
    write_role = Role.INSPECTOR
    delete_role = Role.ADMINISTRATOR
    action_roles = {"submit": Role.INSPECTOR, "retry": Role.INSPECTOR, "reprocess": Role.ENGINEER}
    filterset_class = InspectionFilter
    search_fields = ("reference", "structural_asset__asset_name", "structural_asset__asset_code", "notes")
    ordering_fields = (
        "inspection_date",
        "created_at",
        "overall_health_score",
        "defect_count",
        "processing_time",
        "status",
        "reference",
    )
    ordering = ("-inspection_date", "-id")
    http_method_names = ("get", "post", "patch", "delete", "head", "options")

    def get_queryset(self):
        qs = InspectionLog.objects.select_related("structural_asset", "inspector", "ml_model").annotate(
            images_count=Count("images", distinct=True),
            first_thumbnail_key=_first_thumbnail_subquery(),
        )
        if self.action in ("retrieve", "results"):
            qs = qs.prefetch_related("images")
        return qs

    def get_serializer_class(self):
        if self.action == "create":
            return InspectionCreateSerializer
        if self.action == "partial_update":
            return InspectionUpdateSerializer
        if self.action == "retrieve":
            return InspectionDetailSerializer
        return InspectionListSerializer

    def create(self, request, *args, **kwargs):
        serializer = InspectionCreateSerializer(data=request.data, context=self.get_serializer_context())
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        inspection = services.create_inspection(
            asset=data["structural_asset"],
            user=request.user,
            inspection_type=data.get("inspection_type"),
            notes=data.get("notes", ""),
            inspection_date=data.get("inspection_date"),
        )
        inspection = self.get_queryset().get(pk=inspection.pk)
        return Response(InspectionDetailSerializer(inspection, context=self.get_serializer_context()).data, status=status.HTTP_201_CREATED)

    def partial_update(self, request, *args, **kwargs):
        inspection = self.get_object()
        if inspection.status not in (InspectionStatus.PENDING, InspectionStatus.FAILED) and not request.user.has_role_at_least(Role.ENGINEER):
            return Response({"detail": "Only engineers can edit an inspection after it has been processed.", "code": "permission_denied"}, status=403)
        serializer = InspectionUpdateSerializer(inspection, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(InspectionDetailSerializer(self.get_queryset().get(pk=inspection.pk), context=self.get_serializer_context()).data)

    @extend_schema(request=None, responses=InspectionStatusSerializer)
    @action(detail=True, methods=["post"])
    def submit(self, request, pk=None):
        """Queue the inspection for asynchronous AI processing."""
        inspection = services.submit_inspection(self.get_object())
        return Response(InspectionStatusSerializer(inspection).data, status=status.HTTP_202_ACCEPTED)

    @extend_schema(request=None, responses=InspectionStatusSerializer)
    @action(detail=True, methods=["post"])
    def retry(self, request, pk=None):
        """Re-queue a failed inspection with its existing imagery."""
        inspection = services.submit_inspection(self.get_object(), allow_statuses=(InspectionStatus.FAILED,))
        return Response(InspectionStatusSerializer(inspection).data, status=status.HTTP_202_ACCEPTED)

    @extend_schema(request=None, responses=InspectionStatusSerializer)
    @action(detail=True, methods=["post"])
    def reprocess(self, request, pk=None):
        """Re-run AI analysis on a completed inspection (e.g. after a model upgrade)."""
        inspection = services.submit_inspection(
            self.get_object(), allow_statuses=(InspectionStatus.COMPLETED, InspectionStatus.FAILED)
        )
        return Response(InspectionStatusSerializer(inspection).data, status=status.HTTP_202_ACCEPTED)

    @extend_schema(responses=InspectionStatusSerializer)
    @action(detail=True, methods=["get"], url_path="status")
    def processing_status(self, request, pk=None):
        """Lightweight status payload for polling clients."""
        inspection = InspectionLog.objects.get(pk=self.get_object().pk)
        return Response(InspectionStatusSerializer(inspection).data)

    @action(detail=True, methods=["get"])
    def results(self, request, pk=None):
        """Complete AI analysis: images, detections, severity summary and model provenance."""
        inspection = self.get_object()
        context = self.get_serializer_context()
        detections = list(inspection.detections.select_related("reviewed_by").order_by("image_record_id", "-confidence_score"))
        images = []
        for image in inspection.images.all():
            image_data = ImageRecordSerializer(image, context=context).data
            image_data["detections"] = DefectDetectionSerializer(
                [d for d in detections if d.image_record_id == image.pk], many=True
            ).data
            image_data["detections_count"] = len(image_data["detections"])
            images.append(image_data)

        active = [d for d in detections if d.review_status != ReviewStatus.REJECTED]
        severity_counts = {level: sum(1 for d in active if d.severity == level) for level in ("CRITICAL", "HIGH", "MEDIUM", "LOW")}
        type_counts: dict[str, int] = {}
        for d in active:
            type_counts[d.defect_type] = type_counts.get(d.defect_type, 0) + 1
        confidences = [d.confidence_score for d in active]
        model = inspection.ml_model

        return Response(
            {
                "inspection": InspectionDetailSerializer(inspection, context=context).data,
                "images": images,
                "summary": {
                    "overall_health_score": inspection.overall_health_score,
                    "health_status": inspection.health_status,
                    "defect_count": len(active),
                    "rejected_count": len(detections) - len(active),
                    "severity_counts": severity_counts,
                    "type_counts": type_counts,
                    "avg_confidence": round(sum(confidences) / len(confidences), 4) if confidences else None,
                    "max_severity": inspection.max_severity,
                },
                "confidence_distribution": services.confidence_distribution(confidences),
                "preprocessing_report": inspection.preprocessing_report,
                "timings": (inspection.summary or {}).get("timings_ms", {}),
                "model": {
                    "name": model.model_name if model else None,
                    "version": inspection.model_version,
                    "framework": model.get_framework_display() if model else None,
                    "architecture": model.architecture if model else None,
                    "is_demo": inspection.inference_mode == "demo",
                },
                "inference_mode": inspection.inference_mode,
                "processing_time": inspection.processing_time,
            }
        )

    @extend_schema(parameters=[OpenApiParameter("days", int, description="Window for completed/failed counts (default 7)")])
    @action(detail=False, methods=["get"])
    def queue(self, request):
        """Processing queue overview for the dashboard."""
        days = max(1, min(int(request.query_params.get("days", 7)), 90))
        since = timezone.now() - timedelta(days=days)
        counts = InspectionLog.objects.aggregate(
            uploading=Count("id", filter=Q(status=InspectionStatus.PENDING, created_at__gte=since)),
            queued=Count("id", filter=Q(status=InspectionStatus.QUEUED)),
            processing=Count("id", filter=Q(status=InspectionStatus.PROCESSING)),
            completed=Count("id", filter=Q(status=InspectionStatus.COMPLETED, completed_at__gte=since)),
            failed=Count("id", filter=Q(status=InspectionStatus.FAILED, updated_at__gte=since)),
        )
        active = (
            self.get_queryset()
            .filter(
                Q(status__in=[InspectionStatus.QUEUED, InspectionStatus.PROCESSING])
                | Q(status=InspectionStatus.FAILED, updated_at__gte=since)
                | Q(status=InspectionStatus.PENDING, created_at__gte=since)
            )
            .order_by("-updated_at")[:8]
        )
        return Response(
            {"window_days": days, "counts": counts, "items": InspectionListSerializer(active, many=True, context=self.get_serializer_context()).data}
        )


class ImageUploadView(APIView):
    """Upload one inspection image (multipart). Stored in S3/MinIO; never processed in-request."""

    permission_classes = (IsInspector,)
    parser_classes = (parsers.MultiPartParser, parsers.FormParser)
    throttle_classes = (ScopedRateThrottle,)
    throttle_scope = "upload"

    @extend_schema(request={"multipart/form-data": ImageUploadSerializer}, responses={201: ImageRecordSerializer})
    def post(self, request):
        serializer = ImageUploadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        record = services.add_image(serializer.validated_data["inspection"], serializer.validated_data["file"], request.user)
        return Response(ImageRecordSerializer(record, context={"request": request}).data, status=status.HTTP_201_CREATED)


class ImageRecordViewSet(mixins.RetrieveModelMixin, mixins.DestroyModelMixin, viewsets.GenericViewSet):
    serializer_class = ImageRecordSerializer
    permission_classes = (RoleBasedAccess,)
    delete_role = Role.INSPECTOR
    queryset = ImageRecord.objects.select_related("inspection")

    def perform_destroy(self, instance):
        services.remove_image(instance)


class DefectDetectionViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, mixins.UpdateModelMixin, viewsets.GenericViewSet):
    """Fleet-wide AI detections. Engineers confirm or reject detections (human-in-the-loop review)."""

    permission_classes = (RoleBasedAccess,)
    write_role = Role.ENGINEER
    filterset_class = DefectDetectionFilter
    search_fields = ("inspection__reference", "inspection__structural_asset__asset_name", "description")
    ordering_fields = ("created_at", "confidence_score", "severity", "area_ratio")
    ordering = ("-created_at", "-confidence_score")
    http_method_names = ("get", "patch", "head", "options")

    def get_queryset(self):
        return DefectDetection.objects.select_related(
            "inspection__structural_asset", "image_record", "reviewed_by"
        )

    def get_serializer_class(self):
        if self.action == "partial_update":
            return DetectionReviewSerializer
        return DefectExplorerSerializer

    def partial_update(self, request, *args, **kwargs):
        detection = self.get_object()
        serializer = DetectionReviewSerializer(detection, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        detection.review_status = serializer.validated_data.get("review_status", detection.review_status)
        detection.reviewed_by = request.user
        detection.reviewed_at = timezone.now()
        detection.save(update_fields=["review_status", "reviewed_by", "reviewed_at"])
        services.invalidate_dashboard_cache()
        return Response(DefectExplorerSerializer(detection, context=self.get_serializer_context()).data)

