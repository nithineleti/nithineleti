from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
ARTIFACT_DIR = ROOT / "artifacts"
REPORT_DIR = ROOT / "reports"
DATA_PATH = DATA_DIR / "sample_fmcg_sales.csv"
MODEL_PATH = ARTIFACT_DIR / "demand_model.joblib"
METRICS_PATH = ARTIFACT_DIR / "metrics.json"
IMPORTANCE_PATH = ARTIFACT_DIR / "feature_importance.csv"
VALIDATION_PATH = ARTIFACT_DIR / "validation_predictions.csv"
BACKTEST_PATH = ARTIFACT_DIR / "rolling_backtests.csv"
PROMOTION_PATH = ARTIFACT_DIR / "promotion_uplift.csv"

RANDOM_STATE = 42
FORECAST_HORIZON = 56

CATEGORICAL_FEATURES = ["sku", "category", "region", "channel"]
NUMERIC_FEATURES = [
    "price",
    "discount_pct",
    "promotion",
    "holiday",
    "competitor_price_index",
    "marketing_spend",
    "temperature_c",
    "rainfall_mm",
    "day_of_week",
    "month",
    "day_sin",
    "day_cos",
    "lag_1",
    "lag_7",
    "lag_14",
    "lag_28",
    "rolling_mean_7",
    "rolling_mean_28",
    "rolling_std_7",
]
FEATURES = CATEGORICAL_FEATURES + NUMERIC_FEATURES
TARGET = "units_demand"
