from pathlib import Path

from app.indexer import build_index
from app.retrieval import retrieve


def test_retrieval_finds_invoice_service():
    root = Path(__file__).resolve().parents[2] / "examples" / "demo_repo"
    chunks = build_index(root)
    hits = retrieve(chunks, "discount at exactly 100 loyal customer", limit=5)
    assert hits
    assert any(hit["path"] == "shop/invoice_service.py" for hit in hits)
