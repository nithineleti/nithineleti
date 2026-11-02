import unittest

import numpy as np

from src.config import CLASSES
from src.modeling import FEATURE_NAMES, load_bundle
from src.service import AgroVisionService
from src.synthetic import generate_leaf
from src.vision import extract_features, segment_leaf, segment_lesions


class AgroVisionTests(unittest.TestCase):
    def test_generator_contract(self):
        image, lesion, leaf = generate_leaf("Rust", seed=9)
        self.assertEqual(np.asarray(image).shape, (128, 128, 3))
        self.assertGreater(leaf.sum(), 1000)
        self.assertGreater(lesion.sum(), 10)

    def test_feature_contract(self):
        image, _, _ = generate_leaf("Healthy", seed=4)
        features = extract_features(image)
        self.assertEqual(len(features), len(FEATURE_NAMES))
        self.assertTrue(np.isfinite(features).all())

    def test_lesion_segmentation_overlap(self):
        image, truth, _ = generate_leaf("Rust", seed=12)
        array = np.asarray(image); leaf = segment_leaf(array); prediction = segment_lesions(array, leaf)
        intersection = np.logical_and(truth, prediction).sum(); union = np.logical_or(truth, prediction).sum()
        self.assertGreater(intersection / max(1, union), .55)

    def test_service_analysis(self):
        image, _, _ = generate_leaf("Leaf Spot", seed=18)
        result = AgroVisionService().analyse(image)
        self.assertIn(result["predicted_class"], CLASSES)
        self.assertEqual(result["overlay"].size, (128, 128))
        self.assertGreaterEqual(result["severity_pct"], 0)

    def test_saved_model_quality(self):
        self.assertGreater(load_bundle().metrics["synthetic_macro_f1"], .85)


if __name__ == "__main__":
    unittest.main()
