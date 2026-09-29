"""Synthetic inspection imagery for tests (concrete texture with known defects)."""

from __future__ import annotations

import cv2
import numpy as np


def concrete_surface(width: int = 1024, height: int = 768, seed: int = 7) -> np.ndarray:
    rng = np.random.default_rng(seed)
    base = rng.normal(150, 9, (height, width)).astype(np.float32)
    coarse = cv2.resize(rng.normal(0, 14, (height // 32, width // 32)).astype(np.float32), (width, height), interpolation=cv2.INTER_CUBIC)
    gray = np.clip(base + coarse, 0, 255).astype(np.uint8)
    return cv2.merge([gray, (gray * 0.98).astype(np.uint8), (gray * 0.95).astype(np.uint8)])


def draw_crack(image: np.ndarray, start: tuple[int, int], steps: int = 60, step_len: int = 9, seed: int = 3) -> tuple[int, int, int, int]:
    rng = np.random.default_rng(seed)
    x, y = start
    angle = 0.35
    pts = [(x, y)]
    for _ in range(steps):
        angle += rng.normal(0, 0.25)
        x = int(np.clip(x + step_len * np.cos(angle), 0, image.shape[1] - 1))
        y = int(np.clip(y + step_len * np.sin(angle), 0, image.shape[0] - 1))
        pts.append((x, y))
    for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
        cv2.line(image, (x0, y0), (x1, y1), (38, 38, 40), 3, cv2.LINE_AA)
    xs, ys = zip(*pts)
    return min(xs), min(ys), max(xs), max(ys)


def draw_rust(image: np.ndarray, center: tuple[int, int], radius: int = 60) -> tuple[int, int, int, int]:
    cv2.circle(image, center, radius, (30, 85, 170), -1, cv2.LINE_AA)  # BGR orange-brown
    return center[0] - radius, center[1] - radius, center[0] + radius, center[1] + radius


def encode(image: np.ndarray, ext: str = ".jpg") -> bytes:
    ok, buf = cv2.imencode(ext, image)
    assert ok
    return buf.tobytes()


def defective_image() -> tuple[bytes, dict]:
    img = concrete_surface()
    crack = draw_crack(img, (120, 200))
    rust = draw_rust(img, (820, 580))
    return encode(img), {"crack": crack, "rust": rust}


def clean_image() -> bytes:
    return encode(concrete_surface(seed=11))


def draw_spall(image: np.ndarray, center: tuple[int, int], radius: int = 70, seed: int = 5) -> tuple[int, int, int, int]:
    rng = np.random.default_rng(seed)
    angles = np.linspace(0, 2 * np.pi, 24, endpoint=False)
    radii = radius * (0.7 + 0.5 * rng.random(24))
    pts = np.stack([center[0] + radii * np.cos(angles), center[1] + radii * np.sin(angles)], axis=1).astype(np.int32)
    cv2.fillPoly(image, [pts], (78, 80, 84), cv2.LINE_AA)
    noise = rng.normal(0, 18, image.shape[:2]).astype(np.float32)
    mask = np.zeros(image.shape[:2], np.uint8)
    cv2.fillPoly(mask, [pts], 1)
    for c in range(3):
        channel = image[:, :, c].astype(np.float32)
        channel[mask > 0] += noise[mask > 0]
        image[:, :, c] = np.clip(channel, 0, 255).astype(np.uint8)
    x, y, w, h = cv2.boundingRect(pts)
    return x, y, x + w, y + h
