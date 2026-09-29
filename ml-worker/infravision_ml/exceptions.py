class InfraVisionMLError(Exception):
    """Base error. ``user_message`` is safe to show in the dashboard."""

    user_message = "AI inference failed."

    def __init__(self, message: str | None = None):
        super().__init__(message or self.user_message)
        if message:
            self.user_message = message


class ImageDecodeError(InfraVisionMLError):
    user_message = "The image could not be decoded. It may be corrupted or in an unsupported format."


class ModelLoadError(InfraVisionMLError):
    user_message = "The AI model could not be loaded on the ML worker. Check the model files and worker logs."


class ConfigurationError(InfraVisionMLError):
    user_message = "The ML worker is misconfigured."
