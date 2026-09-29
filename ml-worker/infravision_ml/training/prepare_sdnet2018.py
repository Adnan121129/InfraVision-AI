"""Reorganise SDNET2018 into an ImageFolder train/val split.

SDNET2018 (Dorafshan, Thomas & Maguire, 2018) contains 56,000+ 256x256 patches
of bridge decks (D), walls (W) and pavements (P), each split into cracked
(CD/CW/CP) and uncracked (UD/UW/UP) folders.

Usage::

    python -m infravision_ml.training.prepare_sdnet2018 \\
        --source /data/SDNET2018 --output /data/sdnet-split --val-fraction 0.15

Produces ``output/{train,val}/{crack,no_defect}/...`` using symlinks (or
copies with ``--copy``), stratified per surface type.
"""

from __future__ import annotations

import argparse
import random
import shutil
from pathlib import Path

CLASS_FOLDERS = {"CD": "crack", "CW": "crack", "CP": "crack", "UD": "no_defect", "UW": "no_defect", "UP": "no_defect"}
IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png"}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--val-fraction", type=float, default=0.15)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--copy", action="store_true", help="Copy files instead of symlinking")
    args = parser.parse_args()

    rng = random.Random(args.seed)
    counts: dict[str, int] = {}
    for folder in sorted(p for p in args.source.rglob("*") if p.is_dir() and p.name.upper() in CLASS_FOLDERS):
        label = CLASS_FOLDERS[folder.name.upper()]
        files = sorted(f for f in folder.iterdir() if f.suffix.lower() in IMAGE_SUFFIXES)
        rng.shuffle(files)
        n_val = int(len(files) * args.val_fraction)
        for index, file in enumerate(files):
            split = "val" if index < n_val else "train"
            target = args.output / split / label / f"{folder.parent.name}_{folder.name}_{file.name}"
            target.parent.mkdir(parents=True, exist_ok=True)
            if target.exists():
                continue
            if args.copy:
                shutil.copy2(file, target)
            else:
                target.symlink_to(file.resolve())
            counts[f"{split}/{label}"] = counts.get(f"{split}/{label}", 0) + 1

    if not counts:
        raise SystemExit(f"No SDNET2018 class folders (CD, UD, CW, UW, CP, UP) found under {args.source}")
    for key in sorted(counts):
        print(f"{key:>20}: {counts[key]}")


if __name__ == "__main__":
    main()
