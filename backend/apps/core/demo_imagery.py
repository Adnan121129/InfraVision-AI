"""Procedural inspection imagery for demo data.

Generates synthetic but visually plausible surfaces (concrete, painted steel,
asphalt, masonry) with defects drawn at *known* positions, so seeded demo
detections line up with visible damage. Only numpy + Pillow are required.
All imagery produced here is synthetic and is labelled as demo data.
"""

from __future__ import annotations

import io
import math
import random
from dataclasses import dataclass, field

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

WIDTH, HEIGHT = 1280, 960


@dataclass
class DrawnDefect:
    defect_type: str
    bbox: tuple[int, int, int, int]
    size_hint: float  # 0..1 physical extent used for severity


@dataclass
class DemoImage:
    key: str
    surface: str
    content: bytes
    width: int
    height: int
    defects: list[DrawnDefect] = field(default_factory=list)


def _noise(rng: np.random.Generator, h: int, w: int, cell: int, amplitude: float) -> np.ndarray:
    small = rng.normal(0, amplitude, (max(2, h // cell), max(2, w // cell))).astype(np.float32)
    return np.asarray(Image.fromarray(small, mode="F").resize((w, h), Image.Resampling.BICUBIC))


def _surface(kind: str, rng: np.random.Generator) -> Image.Image:
    h, w = HEIGHT, WIDTH
    if kind == "concrete":
        tone = rng.uniform(138, 170)
        gray = tone + rng.normal(0, 7, (h, w)) + _noise(rng, h, w, 24, 10) + _noise(rng, h, w, 120, 9)
        speck = rng.random((h, w))
        gray[speck > 0.996] -= 45
        gray[speck < 0.003] += 30
        rgb = np.stack([gray * 1.0, gray * 0.985, gray * 0.955], axis=-1)
    elif kind == "steel":
        base = np.array([108, 120, 132], dtype=np.float32)
        streak = _noise(rng, h, w, 6, 6).mean(axis=0, keepdims=True).repeat(h, axis=0)
        variation = _noise(rng, h, w, 80, 8) + rng.normal(0, 4, (h, w))
        rgb = base + (streak + variation)[..., None]
    elif kind == "asphalt":
        tone = rng.uniform(62, 78)
        gray = tone + rng.normal(0, 14, (h, w)) + _noise(rng, h, w, 40, 6)
        speck = rng.random((h, w))
        gray[speck > 0.985] += 55
        rgb = np.stack([gray, gray, gray * 1.02], axis=-1)
    else:  # masonry
        rgb = np.zeros((h, w, 3), dtype=np.float32)
        rgb[:] = (182, 176, 165)
        brick_h, brick_w = 64, 150
        for row in range(0, h, brick_h):
            offset = (row // brick_h % 2) * brick_w // 2
            for col in range(-brick_w, w, brick_w):
                x0, y0 = col + offset + 5, row + 5
                color = np.array([rng.uniform(140, 170), rng.uniform(70, 88), rng.uniform(52, 66)])
                rgb[max(0, y0) : min(h, row + brick_h - 5), max(0, x0) : min(w, x0 + brick_w - 10)] = color
        rgb += rng.normal(0, 7, (h, w, 1)) + _noise(rng, h, w, 30, 6)[..., None]
    return Image.fromarray(np.clip(rgb, 0, 255).astype(np.uint8), mode="RGB")


def _bbox(points, pad: int) -> tuple[int, int, int, int]:
    xs = [p[0] for p in points]
    ys = [p[1] for p in points]
    return (max(0, int(min(xs)) - pad), max(0, int(min(ys)) - pad), min(WIDTH, int(max(xs)) + pad), min(HEIGHT, int(max(ys)) + pad))


def _crack(img: Image.Image, rnd: random.Random, length: str = "medium") -> DrawnDefect:
    steps = {"short": rnd.randint(18, 28), "medium": rnd.randint(40, 60), "long": rnd.randint(70, 95)}[length]
    x, y = rnd.randint(120, WIDTH - 420), rnd.randint(120, HEIGHT - 260)
    angle = rnd.uniform(-0.6, 0.6)
    points = [(x, y)]
    for _ in range(steps):
        angle += rnd.gauss(0, 0.28)
        x = min(WIDTH - 10, max(10, x + 11 * math.cos(angle)))
        y = min(HEIGHT - 10, max(10, y + 11 * math.sin(angle)))
        points.append((x, y))
    layer = Image.new("L", img.size, 0)
    draw = ImageDraw.Draw(layer)
    width = rnd.choice([2, 3, 3, 4])
    draw.line(points, fill=255, width=width, joint="curve")
    if rnd.random() < 0.45:
        start = rnd.randint(len(points) // 3, len(points) - 2)
        bx, by = points[start]
        branch_angle = angle + rnd.choice([-1, 1]) * rnd.uniform(0.6, 1.2)
        branch = [(bx, by)]
        for _ in range(rnd.randint(8, 18)):
            branch_angle += rnd.gauss(0, 0.3)
            bx = min(WIDTH - 10, max(10, bx + 10 * math.cos(branch_angle)))
            by = min(HEIGHT - 10, max(10, by + 10 * math.sin(branch_angle)))
            branch.append((bx, by))
        draw.line(branch, fill=220, width=max(1, width - 1), joint="curve")
        points += branch
    layer = layer.filter(ImageFilter.GaussianBlur(0.8))
    dark = Image.new("RGB", img.size, (34, 33, 35))
    img.paste(dark, (0, 0), layer)
    extent = max(max(p[0] for p in points) - min(p[0] for p in points), max(p[1] for p in points) - min(p[1] for p in points)) / WIDTH
    return DrawnDefect("CRACK", _bbox(points, 6), min(1.0, extent / 0.5))


def _blob(rnd: random.Random, cx: int, cy: int, radius: int, jitter: float = 0.45, n: int = 22):
    points = []
    for i in range(n):
        a = 2 * math.pi * i / n
        r = radius * (1 - jitter / 2 + jitter * rnd.random())
        points.append((cx + r * math.cos(a), cy + r * 0.8 * math.sin(a)))
    return points


def _spall(img: Image.Image, rnd: random.Random, rebar: bool) -> list[DrawnDefect]:
    radius = rnd.randint(60, 120)
    cx, cy = rnd.randint(radius + 40, WIDTH - radius - 40), rnd.randint(radius + 40, HEIGHT - radius - 40)
    pts = _blob(rnd, cx, cy, radius)
    mask = Image.new("L", img.size, 0)
    ImageDraw.Draw(mask).polygon(pts, fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(1.5))
    rough = np.random.default_rng(rnd.randint(0, 10_000)).normal(0, 16, (HEIGHT, WIDTH))
    base = np.clip(88 + rough, 0, 255).astype(np.uint8)
    texture = Image.fromarray(np.stack([base, base, (base * 0.97).astype(np.uint8)], axis=-1), mode="RGB")
    img.paste(texture, (0, 0), mask)
    box = _bbox(pts, 4)
    defects = [DrawnDefect("SPALLING", box, min(1.0, radius / 110))]
    if rebar:
        draw = ImageDraw.Draw(img)
        for k in range(rnd.randint(2, 3)):
            yy = box[1] + (k + 1) * (box[3] - box[1]) // 4
            draw.line([(box[0] + 18, yy), (box[2] - 18, yy + rnd.randint(-6, 6))], fill=(112, 64, 38), width=rnd.randint(7, 10))
        defects.append(DrawnDefect("EXPOSED_REBAR", (box[0] + 12, box[1] + 12, box[2] - 12, box[3] - 12), 0.8))
    return defects


def _stain(img: Image.Image, rnd: random.Random, kind: str) -> DrawnDefect:
    radius = rnd.randint(50, 110)
    cx, cy = rnd.randint(radius + 30, WIDTH - radius - 30), rnd.randint(radius + 30, HEIGHT - radius - 200)
    layer = Image.new("L", img.size, 0)
    draw = ImageDraw.Draw(layer)
    for _ in range(rnd.randint(4, 7)):
        ox, oy = rnd.randint(-radius // 2, radius // 2), rnd.randint(-radius // 2, radius // 2)
        r = rnd.randint(radius // 3, radius)
        draw.ellipse([cx + ox - r, cy + oy - int(r * 0.8), cx + ox + r, cy + oy + int(r * 0.8)], fill=rnd.randint(150, 230))
    runs_bottom = cy + radius
    if kind in ("RUST", "EFFLORESCENCE"):
        for _ in range(rnd.randint(2, 5)):
            sx = cx + rnd.randint(-radius // 2, radius // 2)
            length = rnd.randint(60, 180)
            draw.line([(sx, cy), (sx + rnd.randint(-6, 6), cy + length)], fill=rnd.randint(120, 200), width=rnd.randint(6, 14))
            runs_bottom = max(runs_bottom, cy + length)
    layer = layer.filter(ImageFilter.GaussianBlur(6 if kind != "CORROSION" else 3))
    colors = {"RUST": (176, 88, 40), "CORROSION": (104, 58, 34), "EFFLORESCENCE": (236, 236, 228), "SURFACE_DAMAGE": (196, 190, 180)}
    fill = Image.new("RGB", img.size, colors[kind])
    img.paste(fill, (0, 0), layer)
    if kind == "CORROSION":
        draw_img = ImageDraw.Draw(img)
        for _ in range(60):
            px, py = cx + rnd.randint(-radius, radius), cy + rnd.randint(-radius // 2, radius // 2)
            r = rnd.randint(2, 5)
            draw_img.ellipse([px - r, py - r, px + r, py + r], fill=(62, 34, 20))
    box = (max(0, cx - radius - 20), max(0, cy - radius), min(WIDTH, cx + radius + 20), min(HEIGHT, runs_bottom + 10))
    return DrawnDefect(kind, box, min(1.0, radius / 100))


# (surface, [defect recipe...]) - recipes: crack:<len>, spall, spall+rebar, RUST, CORROSION, EFFLORESCENCE, SURFACE_DAMAGE
POOL_RECIPES: list[tuple[str, list[str]]] = [
    ("concrete", []),
    ("concrete", []),
    ("concrete", ["crack:short"]),
    ("concrete", ["crack:long"]),
    ("concrete", ["crack:medium", "crack:short", "EFFLORESCENCE"]),
    ("concrete", ["spall", "crack:medium"]),
    ("concrete", ["spall+rebar", "RUST"]),
    ("concrete", ["crack:long", "crack:medium", "crack:short", "spall"]),
    ("concrete", ["EFFLORESCENCE", "crack:short"]),
    ("concrete", ["spall+rebar", "crack:long", "crack:medium", "RUST"]),
    ("steel", []),
    ("steel", ["RUST", "RUST"]),
    ("steel", ["CORROSION", "RUST"]),
    ("steel", ["CORROSION", "CORROSION", "RUST"]),
    ("asphalt", []),
    ("asphalt", ["crack:long", "crack:medium"]),
    ("asphalt", ["SURFACE_DAMAGE", "crack:medium"]),
    ("masonry", ["crack:medium", "EFFLORESCENCE"]),
    ("masonry", []),
    ("masonry", ["crack:long", "SURFACE_DAMAGE"]),
]


def generate_pool(seed: int = 2026) -> list[DemoImage]:
    images = []
    for index, (surface, recipe) in enumerate(POOL_RECIPES):
        rnd = random.Random(seed + index)
        img = _surface(surface, np.random.default_rng(seed + index))
        defects: list[DrawnDefect] = []
        for item in recipe:
            if item.startswith("crack:"):
                defects.append(_crack(img, rnd, item.split(":")[1]))
            elif item.startswith("spall"):
                defects.extend(_spall(img, rnd, rebar=item.endswith("rebar")))
            else:
                defects.append(_stain(img, rnd, item))
        buffer = io.BytesIO()
        img.save(buffer, format="JPEG", quality=88, optimize=True)
        images.append(DemoImage(f"demo/pool/{surface}-{index:02d}.jpg", surface, buffer.getvalue(), WIDTH, HEIGHT, defects))
    return images


def thumbnail(content: bytes, size: int) -> bytes:
    with Image.open(io.BytesIO(content)) as img:
        img = img.convert("RGB")
        img.thumbnail((size, size), Image.Resampling.LANCZOS)
        out = io.BytesIO()
        img.save(out, format="JPEG", quality=80, optimize=True)
        return out.getvalue()
