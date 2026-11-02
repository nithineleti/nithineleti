from __future__ import annotations

import numpy as np
from PIL import Image, ImageEnhance
from scipy import ndimage as ndi

from .config import IMAGE_SIZE


def as_rgb_array(image) -> np.ndarray:
    if isinstance(image, str):
        image = Image.open(image)
    if isinstance(image, np.ndarray):
        image = Image.fromarray(image.astype(np.uint8))
    if not isinstance(image, Image.Image):
        raise ValueError("Expected an image path, PIL image or NumPy array")
    return np.asarray(image.convert("RGB").resize((IMAGE_SIZE, IMAGE_SIZE)), dtype=np.uint8)


def segment_leaf(array: np.ndarray) -> np.ndarray:
    rgb = array.astype(float)
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    green_seed = (g > 45) & (g > b * 1.06) & (g > r * .93) & ((g - np.minimum(r, b)) > 12)
    mask = ndi.binary_dilation(green_seed, iterations=7)
    mask = ndi.binary_fill_holes(mask)
    mask = ndi.binary_erosion(mask, iterations=7)
    mask = ndi.binary_opening(mask, iterations=2)
    labels, count = ndi.label(mask)
    if count:
        sizes = ndi.sum(mask, labels, range(1, count + 1))
        mask = labels == (int(np.argmax(sizes)) + 1)
    return mask


def segment_lesions(array: np.ndarray, leaf_mask: np.ndarray) -> np.ndarray:
    rgb = array.astype(float)
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    intensity = rgb.mean(axis=2)
    rust = (r > g * 1.25) & (r > b * 1.65) & (r > 105)
    dark = (intensity < 93) & (r >= g * .92)
    yellow = (r > 105) & (g > 88) & (b < 85) & (r > g * 1.02)
    lesion = leaf_mask & (rust | dark | yellow)
    lesion = ndi.binary_opening(lesion, iterations=1)
    lesion = ndi.binary_closing(lesion, iterations=1)
    return lesion


def extract_features(image) -> np.ndarray:
    array = as_rgb_array(image)
    leaf = segment_leaf(array)
    pixels = array[leaf] if leaf.any() else array.reshape(-1, 3)
    features: list[float] = []
    features.extend(pixels.mean(axis=0).tolist())
    features.extend(pixels.std(axis=0).tolist())
    for channel in range(3):
        hist, _ = np.histogram(pixels[:, channel], bins=8, range=(0, 256), density=True)
        features.extend(hist.tolist())
    gray = array.mean(axis=2)
    gx = ndi.sobel(gray, axis=1); gy = ndi.sobel(gray, axis=0)
    gradient = np.hypot(gx, gy)[leaf] if leaf.any() else np.hypot(gx, gy).ravel()
    features.extend([float(gradient.mean()), float(gradient.std()), float(np.quantile(gradient, .90))])
    lesion = segment_lesions(array, leaf)
    r, g, b = array[..., 0].astype(float), array[..., 1].astype(float), array[..., 2].astype(float)
    denom = max(1, int(leaf.sum()))
    features.extend([
        float(leaf.mean()), float(lesion.sum() / denom),
        float(((r > g * 1.2) & leaf).sum() / denom),
        float(((array.mean(axis=2) < 95) & leaf).sum() / denom),
        float(((r > 105) & (g > 85) & (b < 90) & leaf).sum() / denom),
    ])
    h, w = leaf.shape
    for y0, y1, x0, x1 in ((0,h//2,0,w//2),(0,h//2,w//2,w),(h//2,h,0,w//2),(h//2,h,w//2,w)):
        local_leaf = leaf[y0:y1, x0:x1]
        local_lesion = lesion[y0:y1, x0:x1]
        features.append(float(local_lesion.sum() / max(1, local_leaf.sum())))
    return np.asarray(features, dtype=np.float32)


def image_quality(image) -> dict:
    array = as_rgb_array(image)
    gray = array.mean(axis=2)
    leaf = segment_leaf(array)
    sharpness = float(np.var(ndi.laplace(gray)))
    brightness = float(gray.mean())
    coverage = float(leaf.mean() * 100)
    warnings = []
    if sharpness < 65: warnings.append("image may be blurred")
    if brightness < 55: warnings.append("image is too dark")
    if brightness > 220: warnings.append("image is overexposed")
    if coverage < 12: warnings.append("leaf occupies too little of the image")
    return {"sharpness": round(sharpness, 1), "brightness": round(brightness, 1), "leaf_coverage_pct": round(coverage, 1), "warnings": warnings}


def create_overlay(image, lesion_mask: np.ndarray) -> Image.Image:
    base = Image.fromarray(as_rgb_array(image)).convert("RGBA")
    overlay = np.zeros((IMAGE_SIZE, IMAGE_SIZE, 4), dtype=np.uint8)
    overlay[lesion_mask] = [255, 70, 55, 135]
    return Image.alpha_composite(base, Image.fromarray(overlay, "RGBA")).convert("RGB")


def enhance_for_review(image) -> Image.Image:
    return ImageEnhance.Contrast(Image.fromarray(as_rgb_array(image))).enhance(1.08)
