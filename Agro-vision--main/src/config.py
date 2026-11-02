from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
SAMPLE_DIR = DATA_DIR / "samples"
ARTIFACT_DIR = ROOT / "artifacts"
REPORT_DIR = ROOT / "reports"
MODEL_PATH = ARTIFACT_DIR / "agrovision_model.joblib"
METRICS_PATH = ARTIFACT_DIR / "metrics.json"
FEATURES_PATH = ARTIFACT_DIR / "feature_importance.csv"

RANDOM_STATE = 42
CLASSES = ["Healthy", "Leaf Spot", "Rust", "Blight"]
IMAGE_SIZE = 128
