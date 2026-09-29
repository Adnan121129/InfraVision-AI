from __future__ import annotations


def _positions(length: int, tile: int, stride: int) -> list[int]:
    if length <= tile:
        return [0]
    positions = list(range(0, length - tile + 1, stride))
    if positions[-1] != length - tile:
        positions.append(length - tile)  # final tile flush with the edge
    return positions


def tile_grid(width: int, height: int, tile: int, stride: int) -> tuple[list[tuple[int, int, int, int]], tuple[int, int]]:
    """Sliding-window tile boxes (x0, y0, x1, y1) in row-major order and the (rows, cols) grid shape."""
    xs = _positions(width, tile, stride)
    ys = _positions(height, tile, stride)
    boxes = [(x, y, min(x + tile, width), min(y + tile, height)) for y in ys for x in xs]
    return boxes, (len(ys), len(xs))
