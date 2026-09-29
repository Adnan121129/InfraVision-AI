"""Role-based access control.

Role matrix (each role inherits everything from the roles below it):

=============  =====================================================================
Viewer         Read-only access to assets, inspections, alerts, analytics, models
Inspector      + create inspections, upload imagery, move alerts to "investigating"
Engineer       + create/edit assets, review AI detections, resolve alerts, re-run AI
Administrator  + users & roles, ML model registry, platform settings, hard deletes
=============  =====================================================================
"""

from __future__ import annotations

from rest_framework.permissions import SAFE_METHODS, BasePermission

from .models import Role


class HasMinimumRole(BasePermission):
    minimum_role: str = Role.VIEWER
    message = "Your role does not allow this action."

    def has_permission(self, request, view) -> bool:
        user = request.user
        return bool(user and user.is_authenticated and user.has_role_at_least(self.minimum_role))


class IsAdministrator(HasMinimumRole):
    minimum_role = Role.ADMINISTRATOR
    message = "Administrator privileges are required."


class IsEngineer(HasMinimumRole):
    minimum_role = Role.ENGINEER
    message = "Engineer privileges are required."


class IsInspector(HasMinimumRole):
    minimum_role = Role.INSPECTOR
    message = "Inspector privileges are required."


class RoleBasedAccess(BasePermission):
    """Read for every authenticated user; writes gated by per-view role requirements.

    Views may declare ``write_role`` (default Engineer), ``create_role``,
    ``delete_role`` and ``action_roles`` (a mapping of custom action -> role).
    """

    message = "Your role does not allow this action."

    def has_permission(self, request, view) -> bool:
        user = request.user
        if not (user and user.is_authenticated and user.is_active):
            return False

        action = getattr(view, "action", None)
        action_roles = getattr(view, "action_roles", {}) or {}
        if action in action_roles:
            return user.has_role_at_least(action_roles[action])

        if request.method in SAFE_METHODS:
            return True

        write_role = getattr(view, "write_role", Role.ENGINEER)
        if action == "create" or (action is None and request.method == "POST"):
            return user.has_role_at_least(getattr(view, "create_role", write_role))
        if action == "destroy" or request.method == "DELETE":
            return user.has_role_at_least(getattr(view, "delete_role", Role.ADMINISTRATOR))
        return user.has_role_at_least(write_role)
