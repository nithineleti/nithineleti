from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timezone

import joblib
import numpy as np
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics import accuracy_score, classification_report, f1_score
from sklearn.pipeline import FeatureUnion, Pipeline
from sklearn.linear_model import LogisticRegression

from .config import METRICS_PATH, MODEL_PATH, PREDICTIONS_PATH, RANDOM_STATE, TOP_TERMS_PATH
from .data import load_feedback
from .privacy import redact_pii


def _text_features() -> FeatureUnion:
    return FeatureUnion(
        [
            ("word", TfidfVectorizer(ngram_range=(1, 2), min_df=2, max_features=9000, sublinear_tf=True)),
            ("char", TfidfVectorizer(analyzer="char_wb", ngram_range=(3, 5), min_df=3, max_features=7000, sublinear_tf=True)),
        ]
    )


def _classifier(class_weight=None) -> Pipeline:
    return Pipeline(
        [
            ("features", _text_features()),
            ("model", LogisticRegression(max_iter=700, C=3.0, class_weight=class_weight, random_state=RANDOM_STATE)),
        ]
    )


@dataclass
class ConsumerVoiceBundle:
    sentiment_model: Pipeline
    topic_model: Pipeline
    urgent_model: Pipeline
    metrics: dict
    trained_at: str

    def analyze(self, text: str) -> dict:
        clean, pii_types = redact_pii(text)
        sentiment = str(self.sentiment_model.predict([clean])[0])
        sentiment_probs = self.sentiment_model.predict_proba([clean])[0]
        sentiment_classes = self.sentiment_model.named_steps["model"].classes_
        topic = str(self.topic_model.predict([clean])[0])
        topic_probs = self.topic_model.predict_proba([clean])[0]
        urgent_probability = float(self.urgent_model.predict_proba([clean])[0][1])
        return {
            "redacted_text": clean,
            "pii_removed": pii_types,
            "sentiment": sentiment,
            "sentiment_confidence": float(np.max(sentiment_probs)),
            "sentiment_probabilities": {str(k): float(v) for k, v in zip(sentiment_classes, sentiment_probs)},
            "topic": topic,
            "topic_confidence": float(np.max(topic_probs)),
            "urgent": bool(urgent_probability >= 0.50),
            "urgent_probability": urgent_probability,
        }


def _top_terms(model: Pipeline, task: str, top_n: int = 12) -> pd.DataFrame:
    names = model.named_steps["features"].get_feature_names_out()
    classifier = model.named_steps["model"]
    rows = []
    for class_name, coefficients in zip(classifier.classes_, classifier.coef_):
        for index in np.argsort(coefficients)[-top_n:][::-1]:
            rows.append({"task": task, "class": str(class_name), "term": str(names[index]), "weight": round(float(coefficients[index]), 4)})
    return pd.DataFrame(rows)


def train_and_save() -> tuple[ConsumerVoiceBundle, dict]:
    frame = load_feedback().copy()
    frame["clean_text"] = frame["text"].map(lambda value: redact_pii(value)[0])
    cutoff = frame["date"].quantile(0.75)
    train = frame[frame["date"] <= cutoff].copy()
    valid = frame[frame["date"] > cutoff].copy()

    sentiment_model = _classifier().fit(train["clean_text"], train["sentiment"])
    topic_model = _classifier().fit(train["clean_text"], train["topic"])
    urgent_model = _classifier("balanced").fit(train["clean_text"], train["urgent"])

    sentiment_pred = sentiment_model.predict(valid["clean_text"])
    topic_pred = topic_model.predict(valid["clean_text"])
    urgent_pred = urgent_model.predict(valid["clean_text"])
    sentiment_report = classification_report(valid["sentiment"], sentiment_pred, output_dict=True, zero_division=0)
    topic_report = classification_report(valid["topic"], topic_pred, output_dict=True, zero_division=0)
    metrics = {
        "sentiment_accuracy": float(accuracy_score(valid["sentiment"], sentiment_pred)),
        "sentiment_macro_f1": float(f1_score(valid["sentiment"], sentiment_pred, average="macro")),
        "topic_accuracy": float(accuracy_score(valid["topic"], topic_pred)),
        "topic_macro_f1": float(f1_score(valid["topic"], topic_pred, average="macro")),
        "urgent_f1": float(f1_score(valid["urgent"], urgent_pred, zero_division=0)),
        "training_rows": int(len(train)),
        "validation_rows": int(len(valid)),
        "validation_start": pd.Timestamp(valid["date"].min()).date().isoformat(),
        "sentiment_per_class_f1": {name: float(sentiment_report[name]["f1-score"]) for name in sentiment_model.named_steps["model"].classes_},
        "topic_per_class_f1": {name: float(topic_report[name]["f1-score"]) for name in topic_model.named_steps["model"].classes_},
    }
    bundle = ConsumerVoiceBundle(sentiment_model, topic_model, urgent_model, metrics, datetime.now(timezone.utc).isoformat())
    MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(bundle, MODEL_PATH)
    METRICS_PATH.write_text(json.dumps(metrics, indent=2), encoding="utf-8")
    output = valid[["feedback_id", "date", "product", "text", "sentiment", "topic", "urgent"]].copy()
    output["predicted_sentiment"] = sentiment_pred
    output["predicted_topic"] = topic_pred
    output["predicted_urgent"] = urgent_pred
    output.to_csv(PREDICTIONS_PATH, index=False)
    pd.concat([_top_terms(sentiment_model, "sentiment"), _top_terms(topic_model, "topic")]).to_csv(TOP_TERMS_PATH, index=False)
    return bundle, metrics


def load_bundle() -> ConsumerVoiceBundle:
    if not MODEL_PATH.exists():
        return train_and_save()[0]
    return joblib.load(MODEL_PATH)
