from __future__ import annotations

import numpy as np
import pandas as pd

from .config import FEATURES, TARGET


GROUP_KEYS = ["sku", "region"]


def engineer_features(df: pd.DataFrame, drop_na: bool = True) -> pd.DataFrame:
    frame = df.copy().sort_values(GROUP_KEYS + ["date"])
    frame["day_of_week"] = frame["date"].dt.dayofweek
    frame["month"] = frame["date"].dt.month
    frame["day_sin"] = np.sin(2 * np.pi * frame["day_of_week"] / 7)
    frame["day_cos"] = np.cos(2 * np.pi * frame["day_of_week"] / 7)

    grouped = frame.groupby(GROUP_KEYS, sort=False)[TARGET]
    for lag in (1, 7, 14, 28):
        frame[f"lag_{lag}"] = grouped.shift(lag)
    for window in (7, 28):
        frame[f"rolling_mean_{window}"] = grouped.transform(
            lambda s: s.shift(1).rolling(window, min_periods=window).mean()
        )
    frame["rolling_std_7"] = grouped.transform(
        lambda s: s.shift(1).rolling(7, min_periods=7).std()
    )

    if drop_na:
        frame = frame.dropna(subset=FEATURES + [TARGET]).reset_index(drop=True)
    return frame


def time_split(frame: pd.DataFrame, validation_days: int = 56):
    cutoff = frame["date"].max() - pd.Timedelta(days=validation_days - 1)
    train = frame[frame["date"] < cutoff].copy()
    valid = frame[frame["date"] >= cutoff].copy()
    if train.empty or valid.empty:
        raise ValueError("Not enough history for the requested time split")
    return train, valid, cutoff
