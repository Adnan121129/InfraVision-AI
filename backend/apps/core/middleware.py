import logging
import time

logger = logging.getLogger("apps.requests")


class RequestLoggingMiddleware:
    """Logs API request timing; slow requests are logged at WARNING level."""

    SLOW_REQUEST_MS = 1500

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        started = time.perf_counter()
        response = self.get_response(request)
        if request.path.startswith("/api/") and not request.path.startswith("/api/health"):
            elapsed_ms = (time.perf_counter() - started) * 1000
            level = logging.WARNING if elapsed_ms > self.SLOW_REQUEST_MS else logging.INFO
            user = getattr(request, "user", None)
            logger.log(
                level,
                "%s %s -> %s in %.0fms (user=%s)",
                request.method,
                request.path,
                response.status_code,
                elapsed_ms,
                getattr(user, "pk", None),
            )
        return response
