from pathlib import Path
from app.engine import analyze_bytes
BASE=Path(__file__).resolve().parents[1]/"static/samples"
def test_scratch():
    r=analyze_bytes((BASE/"scratch.png").read_bytes())
    assert r["label"]=="scratch" and r["bbox"]
def test_normal():
    r=analyze_bytes((BASE/"normal.png").read_bytes())
    assert r["label"]=="normal"
