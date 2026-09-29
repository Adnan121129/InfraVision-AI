"""Transfer-learning trainer for the structural defect patch classifier.

Expects an ImageFolder layout (see ``prepare_sdnet2018.py``)::

    data/train/<class>/*.jpg
    data/val/<class>/*.jpg

Class folder names are mapped to the platform taxonomy (``crack``,
``no_defect``, ``spalling``, ``corrosion`` ...). Training runs in two phases:
the classification head is trained with the ImageNet backbone frozen, then the
whole network is fine-tuned at a lower learning rate. Class imbalance (severe
in SDNET2018) is handled with a weighted loss. The best checkpoint by macro-F1
is written with a model card that the ML worker reads at start-up::

    python -m infravision_ml.training.train_patch_classifier \\
        --data-dir /data/sdnet-split --arch resnet50 --epochs 12 \\
        --output-dir /models --name "InfraVision CrackNet" --version 1.0.0
"""

from __future__ import annotations

import argparse
import json
import time
from datetime import datetime, timezone
from pathlib import Path


def parse_args(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--data-dir", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, default=Path("/models"))
    parser.add_argument("--arch", default="resnet50")
    parser.add_argument("--name", default="InfraVision Defect Classifier")
    parser.add_argument("--version", default=datetime.now(timezone.utc).strftime("%Y.%m.%d"))
    parser.add_argument("--dataset-name", default="SDNET2018")
    parser.add_argument("--epochs", type=int, default=12)
    parser.add_argument("--freeze-epochs", type=int, default=2, help="Epochs training only the head")
    parser.add_argument("--batch-size", type=int, default=64)
    parser.add_argument("--lr", type=float, default=1e-3)
    parser.add_argument("--fine-tune-lr", type=float, default=1e-4)
    parser.add_argument("--img-size", type=int, default=224)
    parser.add_argument("--num-workers", type=int, default=4)
    parser.add_argument("--device", default="auto")
    parser.add_argument("--no-pretrained", action="store_true", help="Train from scratch (testing only)")
    parser.add_argument("--max-steps-per-epoch", type=int, default=0, help="Limit steps (smoke tests)")
    parser.add_argument("--seed", type=int, default=42)
    return parser.parse_args(argv)


def build_loaders(args):
    import torch
    from torchvision import datasets, transforms

    mean, std = (0.485, 0.456, 0.406), (0.229, 0.224, 0.225)
    train_tf = transforms.Compose(
        [
            transforms.RandomResizedCrop(args.img_size, scale=(0.7, 1.0)),
            transforms.RandomHorizontalFlip(),
            transforms.RandomVerticalFlip(),
            transforms.RandomRotation(15),
            transforms.ColorJitter(brightness=0.25, contrast=0.25, saturation=0.15),
            transforms.ToTensor(),
            transforms.Normalize(mean, std),
        ]
    )
    val_tf = transforms.Compose(
        [
            transforms.Resize(int(args.img_size * 1.14)),
            transforms.CenterCrop(args.img_size),
            transforms.ToTensor(),
            transforms.Normalize(mean, std),
        ]
    )
    train_ds = datasets.ImageFolder(args.data_dir / "train", transform=train_tf)
    val_ds = datasets.ImageFolder(args.data_dir / "val", transform=val_tf)
    if train_ds.classes != val_ds.classes:
        raise SystemExit(f"Train/val classes differ: {train_ds.classes} vs {val_ds.classes}")
    loader_kwargs = {"batch_size": args.batch_size, "num_workers": args.num_workers, "pin_memory": torch.cuda.is_available()}
    return (
        torch.utils.data.DataLoader(train_ds, shuffle=True, **loader_kwargs),
        torch.utils.data.DataLoader(val_ds, shuffle=False, **loader_kwargs),
        train_ds,
    )


def evaluate(model, loader, device, num_classes: int, max_steps: int = 0) -> dict:
    import torch

    confusion = torch.zeros(num_classes, num_classes, dtype=torch.long)
    model.eval()
    with torch.inference_mode():
        for step, (images, targets) in enumerate(loader):
            if max_steps and step >= max_steps:
                break
            preds = model(images.to(device)).argmax(dim=1).cpu()
            for t, p in zip(targets, preds):
                confusion[t, p] += 1
    tp = confusion.diag().float()
    precision = tp / confusion.sum(dim=0).clamp(min=1)
    recall = tp / confusion.sum(dim=1).clamp(min=1)
    f1 = 2 * precision * recall / (precision + recall).clamp(min=1e-8)
    total = confusion.sum().item()
    return {
        "accuracy": round(tp.sum().item() / max(1, total), 4),
        "precision": round(precision.mean().item(), 4),
        "recall": round(recall.mean().item(), 4),
        "f1": round(f1.mean().item(), 4),
        "per_class_recall": [round(v, 4) for v in recall.tolist()],
        "samples": total,
    }


def main(argv=None) -> dict:
    import torch
    import torch.nn as nn

    from ..models.architectures import build_classifier, classifier_head
    from ..models.card import ModelCard

    args = parse_args(argv)
    torch.manual_seed(args.seed)
    device = torch.device("cuda" if (args.device == "auto" and torch.cuda.is_available()) else ("cpu" if args.device == "auto" else args.device))
    train_loader, val_loader, train_ds = build_loaders(args)
    classes = train_ds.classes
    print(f"Classes: {classes} | train={len(train_ds)} | device={device}")

    model = build_classifier(args.arch, len(classes), pretrained=not args.no_pretrained).to(device)
    counts = torch.bincount(torch.tensor(train_ds.targets), minlength=len(classes)).float()
    weights = (counts.sum() / (len(classes) * counts.clamp(min=1))).to(device)
    criterion = nn.CrossEntropyLoss(weight=weights, label_smoothing=0.05)

    head = classifier_head(model, args.arch)
    head_params = {id(p) for p in head.parameters()}

    def configure(phase: str):
        for p in model.parameters():
            p.requires_grad = phase == "finetune" or id(p) in head_params
        lr = args.lr if phase == "head" else args.fine_tune_lr
        params = [p for p in model.parameters() if p.requires_grad]
        optimizer = torch.optim.AdamW(params, lr=lr, weight_decay=1e-4)
        return optimizer

    args.output_dir.mkdir(parents=True, exist_ok=True)
    best = {"f1": -1.0}
    history = []
    phase = "head" if args.freeze_epochs > 0 else "finetune"
    optimizer = configure(phase)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=max(1, args.epochs))

    for epoch in range(1, args.epochs + 1):
        if phase == "head" and epoch > args.freeze_epochs:
            phase = "finetune"
            optimizer = configure(phase)
            scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=max(1, args.epochs - epoch + 1))
        model.train()
        started, running, seen = time.time(), 0.0, 0
        for step, (images, targets) in enumerate(train_loader):
            if args.max_steps_per_epoch and step >= args.max_steps_per_epoch:
                break
            images, targets = images.to(device), targets.to(device)
            optimizer.zero_grad(set_to_none=True)
            loss = criterion(model(images), targets)
            loss.backward()
            optimizer.step()
            running += loss.item() * len(targets)
            seen += len(targets)
        scheduler.step()
        metrics = evaluate(model, val_loader, device, len(classes), args.max_steps_per_epoch)
        metrics.update({"epoch": epoch, "phase": phase, "train_loss": round(running / max(1, seen), 4), "seconds": round(time.time() - started, 1)})
        history.append(metrics)
        print(json.dumps(metrics))
        if metrics["f1"] > best["f1"]:
            best = metrics
            torch.save(model.state_dict(), args.output_dir / "model.pt")

    card = ModelCard(
        name=args.name,
        version=args.version,
        architecture=args.arch,
        classes=list(classes),
        framework="pytorch",
        input_size=args.img_size,
        training_dataset=args.dataset_name,
        description=f"{args.arch} patch classifier trained with transfer learning on {args.dataset_name}.",
        metrics={k: best[k] for k in ("accuracy", "precision", "recall", "f1")},
        created_at=datetime.now(timezone.utc).isoformat(),
    )
    card.save(args.output_dir / "model_card.json")
    (args.output_dir / "training_history.json").write_text(json.dumps(history, indent=2))
    print(f"Best epoch {best.get('epoch')} macro-F1={best['f1']} -> {args.output_dir / 'model.pt'}")
    return best


if __name__ == "__main__":
    main()
