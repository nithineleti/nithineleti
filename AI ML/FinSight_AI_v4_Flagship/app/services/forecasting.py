from __future__ import annotations
import math
import warnings
import numpy as np
from sklearn.ensemble import GradientBoostingRegressor, RandomForestRegressor
from sklearn.linear_model import LinearRegression
from sqlalchemy import delete, select
from sqlalchemy.orm import Session
from ..models import FinancialPoint


def _lag_xy(values: np.ndarray, lags: int = 3):
    if len(values) <= lags:
        raise ValueError("insufficient lag history")
    X, y = [], []
    for i in range(lags, len(values)):
        X.append(values[i-lags:i])
        y.append(values[i])
    return np.asarray(X), np.asarray(y)


def _recursive_lag_predict(model, train: np.ndarray, horizon: int, lags: int = 3) -> np.ndarray:
    hist = list(map(float, train))
    out = []
    for _ in range(horizon):
        x = np.asarray(hist[-lags:]).reshape(1, -1)
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            pred = float(model.predict(x)[0])
        out.append(pred); hist.append(pred)
    return np.asarray(out)


def _predict(model_name: str, train: np.ndarray, horizon: int) -> np.ndarray:
    if model_name == "naive_last":
        return np.repeat(train[-1], horizon)
    if model_name == "moving_average_4":
        return np.repeat(np.mean(train[-min(4, len(train)):]), horizon)
    if model_name == "drift":
        slope = (train[-1] - train[0]) / max(1, len(train) - 1)
        return np.array([train[-1] + slope * i for i in range(1, horizon + 1)])
    if model_name == "holt_linear":
        from statsmodels.tsa.holtwinters import Holt
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            fit = Holt(train, initialization_method="estimated", damped_trend=True).fit(optimized=True)
        return np.asarray(fit.forecast(horizon), dtype=float)
    if model_name == "arima_1_1_0":
        from statsmodels.tsa.arima.model import ARIMA
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            fit = ARIMA(train, order=(1, 1, 0), trend="t").fit()
        return np.asarray(fit.forecast(horizon), dtype=float)
    if model_name == "gradient_boosting_lag3":
        X, y = _lag_xy(train, 3)
        model = GradientBoostingRegressor(random_state=42, n_estimators=80, max_depth=2, learning_rate=0.04).fit(X, y)
        return _recursive_lag_predict(model, train, horizon, 3)
    if model_name == "random_forest_lag3":
        X, y = _lag_xy(train, 3)
        model = RandomForestRegressor(random_state=42, n_estimators=120, max_depth=4, min_samples_leaf=1).fit(X, y)
        return _recursive_lag_predict(model, train, horizon, 3)
    if model_name == "xgboost_lag3":
        import xgboost as xgb
        X, y = _lag_xy(train, 3)
        model = xgb.XGBRegressor(n_estimators=80, max_depth=2, learning_rate=0.04, subsample=0.9, colsample_bytree=0.9, random_state=42, objective="reg:squarederror", verbosity=0).fit(X, y)
        return _recursive_lag_predict(model, train, horizon, 3)
    if model_name == "lightgbm_lag3":
        import lightgbm as lgb
        X, y = _lag_xy(train, 3)
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            model = lgb.LGBMRegressor(n_estimators=80, max_depth=2, learning_rate=0.04, random_state=42, verbosity=-1).fit(X, y)
        return _recursive_lag_predict(model, train, horizon, 3)
    if model_name == "ensemble_trend":
        pieces = []
        for name in ["drift", "linear_trend", "holt_linear"]:
            try:
                pieces.append(_predict(name, train, horizon))
            except Exception:
                pass
        if not pieces:
            raise ValueError("no ensemble members available")
        return np.mean(np.vstack(pieces), axis=0)
    # linear_trend
    x = np.arange(len(train)).reshape(-1, 1)
    model = LinearRegression().fit(x, train)
    future = np.arange(len(train), len(train) + horizon).reshape(-1, 1)
    return model.predict(future)


def _backtest(values: np.ndarray, model_name: str, min_train: int = 6) -> dict:
    errors = []
    ape = []
    latency_samples = []
    import time
    for end in range(min_train, len(values)):
        t0 = time.perf_counter()
        try:
            pred = float(_predict(model_name, values[:end], 1)[0])
        except Exception as exc:
            return {"mae": None, "rmse": None, "mape": None, "errors": [], "available": False, "reason": type(exc).__name__}
        latency_samples.append((time.perf_counter() - t0) * 1000)
        actual = float(values[end])
        errors.append(actual - pred)
        if actual != 0:
            ape.append(abs((actual - pred) / actual))
    if not errors:
        return {"mae": None, "rmse": None, "mape": None, "errors": [], "available": False, "reason": "no_backtest_points"}
    e = np.array(errors)
    return {
        "mae": round(float(np.mean(np.abs(e))), 3),
        "rmse": round(float(math.sqrt(np.mean(e**2))), 3),
        "mape": round(float(np.mean(ape) * 100), 3) if ape else None,
        "errors": errors,
        "available": True,
        "avg_fit_predict_ms": round(float(np.mean(latency_samples)), 2),
    }


def forecast_series(db: Session, series_name: str = "revenue_m", horizon: int = 4) -> dict:
    points = db.scalars(select(FinancialPoint).where(FinancialPoint.series_name == series_name).order_by(FinancialPoint.id)).all()
    if len(points) < 6:
        raise ValueError("At least 6 observations are required")
    values = np.array([p.value for p in points], dtype=float)
    model_names = [
        "naive_last", "moving_average_4", "drift", "linear_trend", "holt_linear", "arima_1_1_0",
        "gradient_boosting_lag3", "random_forest_lag3", "xgboost_lag3", "lightgbm_lag3", "ensemble_trend",
    ]
    metrics = {name: _backtest(values, name) for name in model_names}
    valid = [(name, m["mae"]) for name, m in metrics.items() if m.get("mae") is not None]
    if not valid:
        raise ValueError("No forecasting model could be fit")
    best_name = min(valid, key=lambda x: x[1])[0]
    pred = _predict(best_name, values, horizon)
    residuals = metrics[best_name]["errors"]
    residual_std = float(np.std(residuals, ddof=1)) if len(residuals) > 1 else 0.0
    labels = _future_labels(points[-1].period, horizon)
    forecast = []
    for i, (label, value) in enumerate(zip(labels, pred), 1):
        width = 1.96 * residual_std * math.sqrt(i)
        forecast.append({
            "period": label,
            "value": round(float(value), 2),
            "lower_95": round(float(value - width), 2),
            "upper_95": round(float(value + width), 2),
        })
    leaderboard = sorted(
        [{"model": n, "mae": m.get("mae"), "rmse": m.get("rmse"), "mape": m.get("mape"), "available": m.get("available", False)} for n, m in metrics.items()],
        key=lambda x: (x["mae"] is None, x["mae"] if x["mae"] is not None else 1e18),
    )
    return {
        "series_name": series_name,
        "history": [{"period": p.period, "value": p.value} for p in points],
        "selected_model": best_name,
        "model_leaderboard": leaderboard,
        "backtest_metrics": {k: {kk: vv for kk, vv in v.items() if kk != "errors"} for k, v in metrics.items()},
        "forecast": forecast,
        "method_note": "Models are compared with rolling one-step backtests and selected by MAE. Statistical intervals are residual-based approximations, not guaranteed market ranges.",
    }


def scenario_forecast(db: Session, series_name: str, horizon: int, bull_adjustment_pct: float, bear_adjustment_pct: float) -> dict:
    base = forecast_series(db, series_name, horizon)
    bull = 1 + bull_adjustment_pct / 100
    bear = 1 - bear_adjustment_pct / 100
    scenarios = []
    for row in base["forecast"]:
        scenarios.append({
            "period": row["period"],
            "bear": round(row["value"] * bear, 2),
            "base": row["value"],
            "bull": round(row["value"] * bull, 2),
            "statistical_lower_95": row["lower_95"],
            "statistical_upper_95": row["upper_95"],
        })
    return {
        "series_name": series_name,
        "selected_model": base["selected_model"],
        "adjustments": {"bull_pct": bull_adjustment_pct, "bear_pct": bear_adjustment_pct},
        "scenarios": scenarios,
        "note": "Bull/bear values are user-defined sensitivity scenarios, not probabilistic market forecasts.",
    }


def _future_labels(last_period: str, horizon: int) -> list[str]:
    import re
    match = re.fullmatch(r"(\d{4})-Q([1-4])", last_period.strip())
    if not match:
        return [f"T+{i}" for i in range(1, horizon + 1)]
    year, q = int(match.group(1)), int(match.group(2))
    labels = []
    for _ in range(horizon):
        q += 1
        if q == 5:
            year += 1; q = 1
        labels.append(f"{year}-Q{q}")
    return labels


def replace_series(db: Session, series_name: str, points: list[tuple[str, float]], company: str | None = None, metric: str | None = None) -> None:
    db.execute(delete(FinancialPoint).where(FinancialPoint.series_name == series_name))
    for period, value in points:
        db.add(FinancialPoint(series_name=series_name, period=period, value=float(value), company=company, metric=metric))
    db.commit()
