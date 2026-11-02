from __future__ import annotations
import re
from functools import lru_cache
from ..config import get_settings
from .bm25 import tokenize

settings = get_settings()


def _numeric_tokens(text: str) -> set[str]:
    return set(re.findall(r"\b\d+(?:\.\d+)?%?\b", text))


class FeatureReranker:
    name = "feature"

    def score(self, question: str, item: dict) -> float:
        q = set(tokenize(question))
        d = set(tokenize(item["text"]))
        overlap = len(q & d) / max(1, len(q))
        numbers = len(_numeric_tokens(question) & _numeric_tokens(item["text"]))
        exact = 1.0 if question.lower().strip() in item["text"].lower() else 0.0
        company = 0.08 if item.get("company", "").lower() in question.lower() else 0.0
        base = 0.45 * item.get("dense_score", 0.0) + 0.35 * item.get("bm25_norm", 0.0)
        return min(1.0, base + 0.30 * overlap + 0.07 * min(numbers, 2) + 0.10 * exact + company)

    def rerank(self, question: str, items: list[dict]) -> list[dict]:
        for item in items:
            item["rerank_score"] = round(float(self.score(question, item)), 6)
        return sorted(items, key=lambda x: x["rerank_score"], reverse=True)


class CrossEncoderReranker:
    name = "cross_encoder"

    def __init__(self, model_name: str):
        from sentence_transformers import CrossEncoder  # optional extra
        self.model = CrossEncoder(model_name)
        self.model_name = model_name

    def rerank(self, question: str, items: list[dict]) -> list[dict]:
        if not items:
            return items
        pairs = [(question, x["text"]) for x in items]
        scores = self.model.predict(pairs)
        raw = [float(x) for x in scores]
        lo, hi = min(raw), max(raw)
        for item, score in zip(items, raw):
            norm = 1.0 if hi == lo else (score - lo) / (hi - lo)
            item["rerank_score"] = round(norm, 6)
        return sorted(items, key=lambda x: x["rerank_score"], reverse=True)


@lru_cache(maxsize=1)
def get_reranker():
    if settings.reranker_backend == "cross_encoder":
        try:
            return CrossEncoderReranker(settings.reranker_model)
        except Exception:
            return FeatureReranker()
    return FeatureReranker()


def reranker_status() -> dict:
    rr = get_reranker()
    return {
        "requested_backend": settings.reranker_backend,
        "active_backend": rr.name,
        "model": getattr(rr, "model_name", rr.name),
        "cross_encoder_active": rr.name == "cross_encoder",
    }
