from __future__ import annotations

from django.db.models import Count, Q
from drf_spectacular.utils import extend_schema
from rest_framework import filters, generics, permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from django_filters.rest_framework import DjangoFilterBackend

from .models import Role, User
from .permissions import IsAdministrator
from .serializers import (
    AdminUserSerializer,
    ChangePasswordSerializer,
    LoginSerializer,
    LogoutSerializer,
    RegisterSerializer,
    UserSerializer,
)
from .throttles import AuthRateThrottle


class LoginView(TokenObtainPairView):
    """Exchange email + password for an access/refresh token pair."""

    serializer_class = LoginSerializer
    throttle_classes = (AuthRateThrottle,)


class RefreshView(TokenRefreshView):
    throttle_classes = (AuthRateThrottle,)


class LogoutView(APIView):
    """Blacklist the refresh token so it can no longer be used."""

    @extend_schema(request=LogoutSerializer, responses={205: None})
    def post(self, request):
        serializer = LogoutSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            RefreshToken(serializer.validated_data["refresh"]).blacklist()
        except TokenError:
            pass  # already expired or blacklisted: logging out is still successful
        return Response(status=status.HTTP_205_RESET_CONTENT)


class RegisterView(generics.CreateAPIView):
    serializer_class = RegisterSerializer
    permission_classes = (permissions.AllowAny,)
    authentication_classes = ()
    throttle_classes = (AuthRateThrottle,)

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        refresh = LoginSerializer.get_token(user)
        return Response(
            {"user": UserSerializer(user).data, "access": str(refresh.access_token), "refresh": str(refresh)},
            status=status.HTTP_201_CREATED,
        )


class MeView(generics.RetrieveUpdateAPIView):
    serializer_class = UserSerializer

    def get_object(self):
        return self.request.user


class ChangePasswordView(APIView):
    @extend_schema(request=ChangePasswordSerializer, responses={204: None})
    def post(self, request):
        serializer = ChangePasswordSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        request.user.set_password(serializer.validated_data["new_password"])
        request.user.save(update_fields=["password"])
        return Response(status=status.HTTP_204_NO_CONTENT)


class UserViewSet(viewsets.ModelViewSet):
    """User & role administration (administrators only). Deleting deactivates."""

    serializer_class = AdminUserSerializer
    permission_classes = (IsAdministrator,)
    queryset = User.objects.all().annotate(inspections_count=Count("inspections"))
    filter_backends = (DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter)
    filterset_fields = ("role", "is_active")
    search_fields = ("email", "first_name", "last_name", "username", "organization", "job_title")
    ordering_fields = ("email", "first_name", "last_name", "role", "date_joined", "last_login")
    ordering = ("first_name", "last_name")

    def perform_destroy(self, instance):
        if instance.pk == self.request.user.pk:
            from rest_framework.exceptions import ValidationError

            raise ValidationError({"detail": "You cannot deactivate your own account."})
        instance.is_active = False
        instance.save(update_fields=["is_active"])

    @action(detail=False, methods=["get"])
    def summary(self, request):
        counts = User.objects.aggregate(
            total=Count("id"),
            active=Count("id", filter=Q(is_active=True)),
            **{role.lower(): Count("id", filter=Q(role=role, is_active=True)) for role in Role.values},
        )
        return Response(counts)

    @action(detail=False, methods=["get"], permission_classes=(permissions.IsAuthenticated,))
    def roles(self, request):
        return Response([{"value": value, "label": label} for value, label in Role.choices])
