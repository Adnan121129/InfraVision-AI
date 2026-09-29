"""Backbones for transfer learning. Imported lazily so the demo worker does not need PyTorch."""

from __future__ import annotations

SUPPORTED_ARCHITECTURES = ("resnet50", "resnet18", "efficientnet_b0", "mobilenet_v3_large", "timm:<name>")


def build_classifier(architecture: str, num_classes: int, pretrained: bool = False):
    """Return a torchvision (or timm) backbone with a fresh ``num_classes`` head.

    ``pretrained=True`` loads ImageNet weights for transfer learning. Xception
    and other architectures are available through timm, e.g. ``timm:xception65``.
    """
    import torch.nn as nn

    arch = architecture.lower()
    if arch.startswith("timm:"):
        try:
            import timm
        except ImportError as exc:  # pragma: no cover - optional dependency
            raise ImportError("Install 'timm' to use timm architectures such as Xception.") from exc
        return timm.create_model(architecture.split(":", 1)[1], pretrained=pretrained, num_classes=num_classes)

    from torchvision import models

    if arch == "resnet50":
        model = models.resnet50(weights=models.ResNet50_Weights.IMAGENET1K_V2 if pretrained else None)
        model.fc = nn.Linear(model.fc.in_features, num_classes)
    elif arch == "resnet18":
        model = models.resnet18(weights=models.ResNet18_Weights.IMAGENET1K_V1 if pretrained else None)
        model.fc = nn.Linear(model.fc.in_features, num_classes)
    elif arch == "efficientnet_b0":
        model = models.efficientnet_b0(weights=models.EfficientNet_B0_Weights.IMAGENET1K_V1 if pretrained else None)
        model.classifier[1] = nn.Linear(model.classifier[1].in_features, num_classes)
    elif arch == "mobilenet_v3_large":
        model = models.mobilenet_v3_large(weights=models.MobileNet_V3_Large_Weights.IMAGENET1K_V2 if pretrained else None)
        model.classifier[3] = nn.Linear(model.classifier[3].in_features, num_classes)
    else:
        raise ValueError(f"Unsupported architecture '{architecture}'. Choose one of: {', '.join(SUPPORTED_ARCHITECTURES)}")
    return model


def classifier_head(model, architecture: str):
    """Parameters of the classification head (trained first while the backbone is frozen)."""
    arch = architecture.lower()
    if arch.startswith("resnet"):
        return model.fc
    if arch.startswith("timm:"):
        return model.get_classifier()
    return model.classifier
