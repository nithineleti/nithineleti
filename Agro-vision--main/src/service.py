from __future__ import annotations

import numpy as np

from .modeling import load_bundle
from .vision import as_rgb_array, create_overlay, image_quality, segment_leaf, segment_lesions


ACTIONS = {
    "Healthy": "No obvious synthetic disease pattern detected. Continue routine monitoring and capture another image if symptoms change.",
    "Leaf Spot": "Inspect both sides of nearby leaves, separate heavily affected material and request agronomist confirmation before treatment.",
    "Rust": "Check surrounding plants for orange pustules, reduce cross-plant contact and escalate the sample for agronomic confirmation.",
    "Blight": "Prioritise field inspection, isolate severely affected material and seek urgent agronomist guidance before taking crop action.",
}


class AgroVisionService:
    def __init__(self):
        self.bundle = load_bundle()

    def analyse(self, image) -> dict:
        if image is None:
            raise ValueError("Upload or select a crop-leaf image")
        array = as_rgb_array(image)
        quality = image_quality(array)
        leaf = segment_leaf(array)
        lesion = segment_lesions(array, leaf)
        prediction = self.bundle.predict(array)
        severity = float(lesion.sum() / max(1, leaf.sum()) * 100)
        needs_review = prediction["confidence"] < .65 or bool(quality["warnings"])
        return {
            **prediction,
            "severity_pct": severity,
            "leaf_area_pixels": int(leaf.sum()),
            "lesion_area_pixels": int(lesion.sum()),
            "quality": quality,
            "needs_human_review": needs_review,
            "recommended_action": ACTIONS[prediction["predicted_class"]],
            "overlay": create_overlay(array, lesion),
            "disclaimer": "Portfolio decision-support demo. Results are not a field diagnosis and require agronomist confirmation.",
        }
