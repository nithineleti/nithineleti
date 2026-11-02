from __future__ import annotations
import re
from functools import lru_cache
from sqlalchemy import or_, select
from sqlalchemy.orm import Session
from ..config import get_settings
from ..models import Chunk, Document

settings = get_settings()
POSITIVE = {
    "growth", "grew", "improved", "improvement", "healthy", "positive", "expanded", "higher",
    "support", "increased", "strong", "resilient", "profit", "profitable", "momentum", "gain", "gains",
    "record", "accelerated", "outperformed", "renewal", "renewals"
}
NEGATIVE = {
    "risk", "risks", "delay", "delays", "volatility", "weaker", "slower", "cost", "costs", "expense",
    "markdown", "decline", "declined", "loss", "losses", "pressure", "uncertainty", "shortage", "headwind",
    "impairment", "litigation", "debt"
}


@lru_cache(maxsize=1)
def _finbert_pipeline():
    if not settings.finbert_enabled:
        return None
    try:
        from transformers import pipeline
        return pipeline("text-classification", model=settings.finbert_model, truncation=True)
    except Exception:
        return None


def _lexicon(text: str) -> dict:
    words = re.findall(r"[a-zA-Z]+", text.lower())
    pos_hits = [w for w in words if w in POSITIVE]
    neg_hits = [w for w in words if w in NEGATIVE]
    raw = len(pos_hits) - len(neg_hits)
    norm = raw / max(1, len(pos_hits) + len(neg_hits))
    label = "positive" if norm >= 0.2 else "cautious" if norm <= -0.2 else "neutral"
    return {"score": round(norm, 3), "label": label, "positive_terms": sorted(set(pos_hits))[:8], "negative_terms": sorted(set(neg_hits))[:8], "backend": "financial_lexicon"}


def _finbert(text: str) -> dict | None:
    pipe = _finbert_pipeline()
    if pipe is None:
        return None
    sample = text[:3500]
    try:
        result = pipe(sample)[0]
        raw_label = str(result["label"]).lower()
        label = "cautious" if raw_label == "negative" else raw_label
        return {"score": round(float(result["score"]), 3), "label": label, "positive_terms": [], "negative_terms": [], "backend": "finbert"}
    except Exception:
        return None


def sentiment_by_document(db: Session, user_id: int | None = None) -> list[dict]:
    stmt = select(Document)
    if user_id is not None:
        stmt = stmt.where(or_(Document.uploaded_by.is_(None), Document.uploaded_by == user_id))
    docs = db.scalars(stmt.order_by(Document.company)).all()
    output = []
    for doc in docs:
        chunks = db.scalars(select(Chunk).where(Chunk.document_id == doc.id)).all()
        text = " ".join(c.text for c in chunks)
        result = _finbert(text) or _lexicon(text)
        output.append({"document_id": doc.id, "document": doc.filename, "company": doc.company, **result})
    return output
