"""Procedural leaf-image generator used only for a reproducible portfolio demo."""

from __future__ import annotations

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

from .config import IMAGE_SIZE


def _ellipse_mask(size: int, rng: np.random.Generator) -> np.ndarray:
    yy, xx = np.mgrid[:size, :size]
    cx, cy = size * rng.uniform(.47, .53), size * rng.uniform(.47, .53)
    rx, ry = size * rng.uniform(.30, .37), size * rng.uniform(.38, .45)
    angle = rng.uniform(-.38, .38)
    xr = (xx - cx) * np.cos(angle) + (yy - cy) * np.sin(angle)
    yr = -(xx - cx) * np.sin(angle) + (yy - cy) * np.cos(angle)
    return (xr / rx) ** 2 + (yr / ry) ** 2 <= 1


def _disk(size: int, x: float, y: float, radius: float) -> np.ndarray:
    yy, xx = np.mgrid[:size, :size]
    return (xx - x) ** 2 + (yy - y) ** 2 <= radius ** 2


def generate_leaf(label: str, seed: int | None = None, size: int = IMAGE_SIZE):
    rng = np.random.default_rng(seed)
    background = np.zeros((size, size, 3), dtype=float)
    background[:] = rng.normal([188, 178, 158], [12, 12, 12], (size, size, 3))
    leaf = _ellipse_mask(size, rng)
    image = background
    texture = ndi.gaussian_filter(rng.normal(0, 1, (size, size)), sigma=2.0)
    image[leaf, 0] = 56 + texture[leaf] * 11 + rng.normal(0, 5, leaf.sum())
    image[leaf, 1] = 137 + texture[leaf] * 17 + rng.normal(0, 6, leaf.sum())
    image[leaf, 2] = 59 + texture[leaf] * 9 + rng.normal(0, 5, leaf.sum())

    # Central vein and subtle secondary veins.
    yy, xx = np.mgrid[:size, :size]
    vein = leaf & (np.abs(xx - size / 2 - (yy - size / 2) * rng.uniform(-.18, .18)) < 1.2)
    image[vein] = [118, 174, 91]
    lesion = np.zeros((size, size), dtype=bool)
    leaf_points = np.argwhere(leaf)

    if label == "Leaf Spot":
        for _ in range(int(rng.integers(5, 13))):
            y, x = leaf_points[rng.integers(len(leaf_points))]
            spot = _disk(size, x, y, rng.uniform(3.0, 7.0)) & leaf
            ring = ndi.binary_dilation(spot, iterations=2) & leaf
            image[ring] = [142, 116, 55]
            image[spot] = rng.normal([89, 61, 39], [10, 8, 7], (spot.sum(), 3))
            lesion |= ring
    elif label == "Rust":
        for _ in range(int(rng.integers(18, 42))):
            y, x = leaf_points[rng.integers(len(leaf_points))]
            spot = _disk(size, x, y, rng.uniform(1.3, 3.2)) & leaf
            image[spot] = rng.normal([181, 91, 31], [13, 9, 7], (spot.sum(), 3))
            lesion |= spot
    elif label == "Blight":
        angle = rng.uniform(0, 2 * np.pi)
        center_x = size / 2 + np.cos(angle) * size * .29
        center_y = size / 2 + np.sin(angle) * size * .36
        affected = _disk(size, center_x, center_y, rng.uniform(size * .16, size * .27)) & leaf
        affected = ndi.binary_dilation(affected, iterations=int(rng.integers(2, 6))) & leaf
        mottled = ndi.gaussian_filter(rng.random((size, size)), 2) > .42
        affected &= mottled
        image[affected] = rng.normal([72, 61, 36], [13, 11, 8], (affected.sum(), 3))
        yellow = ndi.binary_dilation(affected, iterations=4) & leaf & ~affected
        image[yellow] = rng.normal([154, 143, 49], [12, 10, 7], (yellow.sum(), 3))
        lesion |= affected | yellow
    elif label != "Healthy":
        raise ValueError(f"Unsupported label: {label}")

    # Field-like brightness, rotation and sensor noise variation.
    image *= rng.uniform(.83, 1.13)
    image += rng.normal(0, rng.uniform(1.0, 5.0), image.shape)
    image = np.clip(image, 0, 255).astype(np.uint8)
    return Image.fromarray(image), lesion, leaf
