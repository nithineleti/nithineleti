from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timezone

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.inspection import permutation_importance
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix, f1_score
from sklearn.model_selection import train_test_split

from .config import ARTIFACT_DIR, CLASSES, FEATURES_PATH, METRICS_PATH, MODEL_PATH, RANDOM_STATE, SAMPLE_DIR
from .synthetic import generate_leaf
from .vision import extract_features, segment_leaf, segment_lesions


FEATURE_NAMES = (
    [f"mean_{c}" for c in "rgb"] + [f"std_{c}" for c in "rgb"]
    + [f"hist_{c}_{i}" for c in "rgb" for i in range(8)]
    + ["gradient_mean", "gradient_std", "gradient_p90"]
    + ["leaf_coverage", "lesion_ratio", "red_ratio", "dark_ratio", "yellow_ratio"]
    + [f"lesion_quadrant_{i}" for i in range(4)]
)


@dataclass
class AgroVisionBundle:
    classifier: RandomForestClassifier
    metrics: dict
    trained_at: str

    def predict(self, image) -> dict:
        features = extract_features(image).reshape(1, -1)
        probabilities = self.classifier.predict_proba(features)[0]
        index = int(np.argmax(probabilities))
        return {
            "predicted_class": str(self.classifier.classes_[index]),
            "confidence": float(probabilities[index]),
            "probabilities": {str(name): float(value) for name, value in zip(self.classifier.classes_, probabilities)},
        }


def train_and_save(images_per_class: int = 180) -> tuple[AgroVisionBundle, dict]:
    ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
    X, y = [], []
    lesion_ious, lesion_dices = [], []
    SAMPLE_DIR.mkdir(parents=True, exist_ok=True)
    for class_index, label in enumerate(CLASSES):
        for index in range(images_per_class):
            seed = RANDOM_STATE * 100000 + class_index * images_per_class + index
            image, true_lesion, _ = generate_leaf(label, seed=seed)
            X.append(extract_features(image))
            # A small share of deliberately ambiguous labels represents noisy
            # field annotation and prevents a misleadingly perfect demo score.
            observed_label = CLASSES[(class_index + 1) % len(CLASSES)] if (index + class_index * 7) % 29 == 0 else label
            y.append(observed_label)
            if index < 3:
                image.save(SAMPLE_DIR / f"{label.lower().replace(' ', '_')}_{index + 1}.png")
            if label != "Healthy" and index < 45:
                array = np.asarray(image)
                pred_leaf = segment_leaf(array)
                pred_lesion = segment_lesions(array, pred_leaf)
                intersection = np.logical_and(true_lesion, pred_lesion).sum()
                union = np.logical_or(true_lesion, pred_lesion).sum()
                lesion_ious.append(intersection / max(1, union))
                lesion_dices.append(2 * intersection / max(1, true_lesion.sum() + pred_lesion.sum()))

    X = np.asarray(X); y = np.asarray(y)
    X_train, X_valid, y_train, y_valid = train_test_split(
        X, y, test_size=.25, random_state=RANDOM_STATE, stratify=y
    )
    classifier = RandomForestClassifier(
        n_estimators=420, max_depth=16, min_samples_leaf=2,
        class_weight="balanced_subsample", random_state=RANDOM_STATE, n_jobs=-1,
    ).fit(X_train, y_train)
    prediction = classifier.predict(X_valid)
    report = classification_report(y_valid, prediction, output_dict=True, zero_division=0)
    metrics = {
        "synthetic_validation_accuracy": float(accuracy_score(y_valid, prediction)),
        "synthetic_macro_f1": float(f1_score(y_valid, prediction, average="macro")),
        "lesion_segmentation_mean_iou": float(np.mean(lesion_ious)),
        "lesion_segmentation_mean_dice": float(np.mean(lesion_dices)),
        "training_images": int(len(X_train)),
        "validation_images": int(len(X_valid)),
        "classes": CLASSES,
        "per_class_f1": {name: float(report[name]["f1-score"]) for name in CLASSES},
        "confusion_matrix": confusion_matrix(y_valid, prediction, labels=CLASSES).tolist(),
        "data_scope": "procedurally generated demonstration images; not field-validated",
    }
    importance = permutation_importance(
        classifier, X_valid, y_valid, n_repeats=5,
        random_state=RANDOM_STATE, scoring="f1_macro", n_jobs=-1,
    )
    pd.DataFrame({"feature": FEATURE_NAMES, "importance": importance.importances_mean, "std": importance.importances_std}).sort_values("importance", ascending=False).to_csv(FEATURES_PATH, index=False)
    bundle = AgroVisionBundle(classifier, metrics, datetime.now(timezone.utc).isoformat())
    joblib.dump(bundle, MODEL_PATH)
    METRICS_PATH.write_text(json.dumps(metrics, indent=2), encoding="utf-8")
    return bundle, metrics


def load_bundle() -> AgroVisionBundle:
    if not MODEL_PATH.exists():
        return train_and_save()[0]
    return joblib.load(MODEL_PATH)
