from __future__ import annotations

import pandas as pd

from .config import BACKTEST_PATH, FEATURES, TARGET
from .data import load_data
from .features import engineer_features
from .modeling import _pipeline, regression_metrics


def rolling_origin_backtest(folds: int = 3, horizon_days: int = 28) -> pd.DataFrame:
    """Evaluate repeated future windows instead of trusting a single split."""
    frame = engineer_features(load_data())
    max_date = frame["date"].max()
    rows = []
    for fold in range(folds, 0, -1):
        valid_end = max_date - pd.Timedelta(days=(fold - 1) * horizon_days)
        valid_start = valid_end - pd.Timedelta(days=horizon_days - 1)
        train = frame[frame["date"] < valid_start]
        valid = frame[(frame["date"] >= valid_start) & (frame["date"] <= valid_end)]
        model = _pipeline()
        model.fit(train[FEATURES], train[TARGET])
        prediction = model.predict(valid[FEATURES])
        metric = regression_metrics(valid[TARGET].to_numpy(), prediction)
        baseline = regression_metrics(valid[TARGET].to_numpy(), valid["lag_7"].to_numpy())
        rows.append(
            {
                "fold": len(rows) + 1,
                "validation_start": valid_start.date().isoformat(),
                "validation_end": valid_end.date().isoformat(),
                "rows": len(valid),
                "wmape_pct": round(metric["wmape_pct"], 3),
                "mae": round(metric["mae"], 3),
                "bias_pct": round(metric["bias_pct"], 3),
                "baseline_mae": round(baseline["mae"], 3),
                "improvement_pct": round((baseline["mae"] - metric["mae"]) / baseline["mae"] * 100, 3),
            }
        )
    result = pd.DataFrame(rows)
    BACKTEST_PATH.parent.mkdir(parents=True, exist_ok=True)
    result.to_csv(BACKTEST_PATH, index=False)
    return result
