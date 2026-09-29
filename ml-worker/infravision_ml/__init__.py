"""InfraVision ML: framework-agnostic structural defect inference.

The Django application talks to this package only through
:class:`infravision_ml.services.PredictionService`, so models can be swapped
(heuristic demo, PyTorch patch classifier, TorchScript, custom factories)
without touching the web application.
"""

__version__ = "1.0.0"
