from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import HistGradientBoostingRegressor, IsolationForest
from sklearn.inspection import permutation_importance
from sklearn.metrics import mean_absolute_error, mean_squared_error
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder

from .config import (
    ARTIFACT_DIR,
    CATEGORICAL_FEATURES,
    FEATURES,
    FORECAST_HORIZON,
    IMPORTANCE_PATH,
    METRICS_PATH,
    MODEL_PATH,
    NUMERIC_FEATURES,
    RANDOM_STATE,
    TARGET,
    VALIDATION_PATH,
)
from .data import load_data
from .features import engineer_features, time_split


def _pipeline(loss: str = "squared_error", quantile: float | None = None) -> Pipeline:
    preprocessing = ColumnTransformer(
        [
            (
                "category",
                OneHotEncoder(handle_unknown="ignore", sparse_output=False),
                CATEGORICAL_FEATURES,
            ),
            ("numeric", "passthrough", NUMERIC_FEATURES),
        ],
        remainder="drop",
    )
    model = HistGradientBoostingRegressor(
        loss=loss,
        quantile=quantile,
        learning_rate=0.055,
        max_iter=260,
        max_leaf_nodes=24,
        min_samples_leaf=28,
        l2_regularization=0.8,
        early_stopping=True,
        validation_fraction=0.12,
        random_state=RANDOM_STATE,
    )
    return Pipeline([("preprocess", preprocessing), ("model", model)])


@dataclass
class DemandModelBundle:
    point_model: Pipeline
    lower_model: Pipeline
    upper_model: Pipeline
    anomaly_model: IsolationForest
    metrics: dict
    residual_std: float
    trained_at: str
    cutoff_date: str

    def predict(self, X: pd.DataFrame) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
        point = np.maximum(0.0, self.point_model.predict(X[FEATURES]))
        raw_low = np.maximum(0.0, self.lower_model.predict(X[FEATURES]))
        raw_high = np.maximum(0.0, self.upper_model.predict(X[FEATURES]))
        low = np.minimum.reduce([raw_low, point, raw_high])
        high = np.maximum.reduce([raw_low, point, raw_high])
        return point, low, high


def regression_metrics(actual: np.ndarray, predicted: np.ndarray) -> dict[str, float]:
    actual = np.asarray(actual, dtype=float)
    predicted = np.asarray(predicted, dtype=float)
    error = actual - predicted
    return {
        "mae": float(mean_absolute_error(actual, predicted)),
        "rmse": float(np.sqrt(mean_squared_error(actual, predicted))),
        "mape_pct": float(np.mean(np.abs(error) / np.maximum(actual, 1)) * 100),
        "wmape_pct": float(np.sum(np.abs(error)) / np.maximum(np.sum(actual), 1) * 100),
        "bias_pct": float(np.sum(predicted - actual) / np.maximum(np.sum(actual), 1) * 100),
    }


def population_stability_index(reference: np.ndarray, current: np.ndarray, bins: int = 10) -> float:
    reference = np.asarray(reference, dtype=float)
    current = np.asarray(current, dtype=float)
    edges = np.unique(np.quantile(reference, np.linspace(0, 1, bins + 1)))
    if len(edges) < 3:
        return 0.0
    edges[0], edges[-1] = -np.inf, np.inf
    ref_counts, _ = np.histogram(reference, bins=edges)
    cur_counts, _ = np.histogram(current, bins=edges)
    ref_pct = np.clip(ref_counts / max(ref_counts.sum(), 1), 1e-5, None)
    cur_pct = np.clip(cur_counts / max(cur_counts.sum(), 1), 1e-5, None)
    return float(np.sum((cur_pct - ref_pct) * np.log(cur_pct / ref_pct)))


def train_and_save(
    model_path: Path | str = MODEL_PATH,
    validation_days: int = FORECAST_HORIZON,
) -> tuple[DemandModelBundle, dict]:
    ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
    frame = engineer_features(load_data())
    train, valid, cutoff = time_split(frame, validation_days)
    X_train, y_train = train[FEATURES], train[TARGET]
    X_valid, y_valid = valid[FEATURES], valid[TARGET]

    point_model = _pipeline()
    lower_model = _pipeline("quantile", 0.10)
    upper_model = _pipeline("quantile", 0.90)
    point_model.fit(X_train, y_train)
    lower_model.fit(X_train, y_train)
    upper_model.fit(X_train, y_train)

    point = np.maximum(0, point_model.predict(X_valid))
    lower_raw = np.maximum(0, lower_model.predict(X_valid))
    upper_raw = np.maximum(0, upper_model.predict(X_valid))
    lower = np.minimum.reduce([lower_raw, point, upper_raw])
    upper = np.maximum.reduce([lower_raw, point, upper_raw])

    model_metrics = regression_metrics(y_valid.to_numpy(), point)
    baseline = valid["lag_7"].to_numpy()
    baseline_metrics = regression_metrics(y_valid.to_numpy(), baseline)
    residuals = y_valid.to_numpy() - point
    anomaly_matrix = np.column_stack(
        [residuals, np.abs(residuals), valid["discount_pct"], valid["stockout_flag"]]
    )
    anomaly_model = IsolationForest(
        n_estimators=180,
        contamination=0.035,
        random_state=RANDOM_STATE,
        n_jobs=-1,
    ).fit(anomaly_matrix)
    anomaly_flags = anomaly_model.predict(anomaly_matrix) == -1

    sample_size = min(1600, len(valid))
    sample = valid.sample(sample_size, random_state=RANDOM_STATE)
    importance = permutation_importance(
        point_model,
        sample[FEATURES],
        sample[TARGET],
        scoring="neg_mean_absolute_error",
        n_repeats=3,
        random_state=RANDOM_STATE,
        n_jobs=-1,
    )
    importance_df = pd.DataFrame(
        {"feature": FEATURES, "importance": importance.importances_mean, "std": importance.importances_std}
    ).sort_values("importance", ascending=False)
    importance_df.to_csv(IMPORTANCE_PATH, index=False)

    prediction_frame = valid[
        ["date", "sku", "product_name", "category", "region", "promotion", "stockout_flag", TARGET]
    ].copy()
    prediction_frame["prediction"] = point.round(2)
    prediction_frame["lower_80"] = lower.round(2)
    prediction_frame["upper_80"] = upper.round(2)
    prediction_frame["residual"] = residuals.round(2)
    prediction_frame["anomaly"] = anomaly_flags.astype(int)
    prediction_frame.to_csv(VALIDATION_PATH, index=False)

    psi = population_stability_index(train[TARGET].to_numpy(), valid[TARGET].to_numpy())
    coverage = float(np.mean((y_valid.to_numpy() >= lower) & (y_valid.to_numpy() <= upper)) * 100)
    metrics = {
        "model": model_metrics,
        "seasonal_naive_baseline": baseline_metrics,
        "mae_improvement_pct": float((baseline_metrics["mae"] - model_metrics["mae"]) / baseline_metrics["mae"] * 100),
        "prediction_interval_coverage_pct": coverage,
        "validation_rows": int(len(valid)),
        "training_rows": int(len(train)),
        "cutoff_date": cutoff.date().isoformat(),
        "target_psi": psi,
        "drift_status": "stable" if psi < 0.10 else "watch" if psi < 0.25 else "retrain",
        "anomaly_rate_pct": float(np.mean(anomaly_flags) * 100),
        "top_features": importance_df.head(8).to_dict("records"),
    }

    bundle = DemandModelBundle(
        point_model=point_model,
        lower_model=lower_model,
        upper_model=upper_model,
        anomaly_model=anomaly_model,
        metrics=metrics,
        residual_std=float(np.std(residuals, ddof=1)),
        trained_at=datetime.now(timezone.utc).isoformat(),
        cutoff_date=cutoff.date().isoformat(),
    )
    joblib.dump(bundle, model_path)
    METRICS_PATH.write_text(json.dumps(metrics, indent=2), encoding="utf-8")
    return bundle, metrics


def load_bundle(path: Path | str = MODEL_PATH) -> DemandModelBundle:
    path = Path(path)
    if not path.exists():
        bundle, _ = train_and_save(path)
        return bundle
    return joblib.load(path)
