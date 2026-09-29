from __future__ import annotations

from django.contrib.auth.models import AbstractUser, UserManager
from django.db import models


class Role(models.TextChoices):
    ADMINISTRATOR = "ADMINISTRATOR", "Administrator"
    ENGINEER = "ENGINEER", "Engineer"
    INSPECTOR = "INSPECTOR", "Inspector"
    VIEWER = "VIEWER", "Viewer"


# Higher number = more privileges. Permissions compare against these ranks.
ROLE_RANK = {Role.VIEWER: 1, Role.INSPECTOR: 2, Role.ENGINEER: 3, Role.ADMINISTRATOR: 4}


class InfraVisionUserManager(UserManager):
    def create_user(self, email, password=None, **extra_fields):
        if not email:
            raise ValueError("An email address is required.")
        email = self.normalize_email(email).lower()
        extra_fields.setdefault("username", email.split("@")[0])
        user = self.model(email=email, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, email, password=None, **extra_fields):
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        extra_fields.setdefault("role", Role.ADMINISTRATOR)
        return self.create_user(email, password, **extra_fields)


class User(AbstractUser):
    """Platform user. Authentication uses the e-mail address."""

    email = models.EmailField("email address", unique=True)
    role = models.CharField(max_length=20, choices=Role.choices, default=Role.VIEWER, db_index=True)
    job_title = models.CharField(max_length=120, blank=True)
    organization = models.CharField(max_length=120, blank=True)
    phone = models.CharField(max_length=40, blank=True)

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = ["username"]

    objects = InfraVisionUserManager()

    class Meta:
        ordering = ("first_name", "last_name", "email")

    def __str__(self) -> str:
        return self.get_full_name() or self.email

    @property
    def role_rank(self) -> int:
        if self.is_superuser:
            return ROLE_RANK[Role.ADMINISTRATOR]
        return ROLE_RANK.get(self.role, 0)

    def has_role_at_least(self, role: str) -> bool:
        return self.is_active and self.role_rank >= ROLE_RANK[role]

    @property
    def is_administrator(self) -> bool:
        return self.has_role_at_least(Role.ADMINISTRATOR)
