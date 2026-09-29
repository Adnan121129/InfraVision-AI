from rest_framework.throttling import AnonRateThrottle


class AuthRateThrottle(AnonRateThrottle):
    """Brute-force protection for login, registration and token refresh."""

    scope = "auth"
