from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
ARTIFACT_DIR = ROOT / "artifacts"
REPORT_DIR = ROOT / "reports"
KNOWLEDGE_DIR = ROOT / "knowledge"
DATA_PATH = DATA_DIR / "consumer_feedback.csv"
MODEL_PATH = ARTIFACT_DIR / "consumer_voice_models.joblib"
METRICS_PATH = ARTIFACT_DIR / "metrics.json"
PREDICTIONS_PATH = ARTIFACT_DIR / "validation_predictions.csv"
TOP_TERMS_PATH = ARTIFACT_DIR / "top_terms.csv"

RANDOM_STATE = 42
LOCAL_LLM_MODEL = "google/flan-t5-small"
