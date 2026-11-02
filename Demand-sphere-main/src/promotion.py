from __future__ import annotations

import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder

from .config import PROMOTION_PATH, RANDOM_STATE, TARGET
from .data import load_data
from .features import engineer_features


PROMO_CATEGORICAL = ["sku", "category", "region", "channel"]
PROMO_NUMERIC = [
    "competitor_price_index", "temperature_c", "rainfall_mm", "day_of_week",
    "month", "day_sin", "day_cos", "lag_1", "lag_7", "lag_14", "lag_28",
    "rolling_mean_7", "rolling_mean_28", "rolling_std_7",
]
PROMO_FEATURES = PROMO_CATEGORICAL + PROMO_NUMERIC


def _uplift_model() -> Pipeline:
    prep = ColumnTransformer(
        [
            ("category", OneHotEncoder(handle_unknown="ignore", sparse_output=False), PROMO_CATEGORICAL),
            ("numeric", "passthrough", PROMO_NUMERIC),
        ]
    )
    model = HistGradientBoostingRegressor(
        learning_rate=0.06, max_iter=220, max_leaf_nodes=20,
        min_samples_leaf=25, l2_regularization=1.0, random_state=RANDOM_STATE,
    )
    return Pipeline([("preprocess", prep), ("model", model)])


def estimate_adjusted_promotion_uplift() -> pd.DataFrame:
    """T-learner estimate adjusted for observed pre-promotion context.

    This is decision-support evidence, not a causal claim: unobserved confounding
    can remain without randomised or quasi-experimental data.
    """
    frame = engineer_features(load_data())
    cutoff = frame["date"].max() - pd.Timedelta(days=90)
    train = frame[frame["date"] < cutoff]
    score = frame[frame["date"] >= cutoff].copy()
    treated = train[train["promotion"].eq(1)]
    control = train[train["promotion"].eq(0)]
    model_t = _uplift_model().fit(treated[PROMO_FEATURES], treated[TARGET])
    model_c = _uplift_model().fit(control[PROMO_FEATURES], control[TARGET])
    score["pred_promotion"] = model_t.predict(score[PROMO_FEATURES])
    score["pred_no_promotion"] = model_c.predict(score[PROMO_FEATURES])
    score["uplift_units"] = score["pred_promotion"] - score["pred_no_promotion"]
    score["uplift_pct"] = score["uplift_units"] / np.maximum(score["pred_no_promotion"], 1) * 100
    result = (
        score.groupby(["sku", "product_name"], as_index=False)
        .agg(
            estimated_uplift_units=("uplift_units", "mean"),
            estimated_uplift_pct=("uplift_pct", "mean"),
            lower_scenario_pct=("uplift_pct", lambda x: x.quantile(0.10)),
            upper_scenario_pct=("uplift_pct", lambda x: x.quantile(0.90)),
            scoring_rows=("uplift_pct", "size"),
        )
    )
    numeric = ["estimated_uplift_units", "estimated_uplift_pct", "lower_scenario_pct", "upper_scenario_pct"]
    result[numeric] = result[numeric].round(2)
    PROMOTION_PATH.parent.mkdir(parents=True, exist_ok=True)
    result.to_csv(PROMOTION_PATH, index=False)
    return result
