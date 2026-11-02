from __future__ import annotations
import json
import math
from functools import lru_cache
from typing import Iterable
import numpy as np
from sklearn.feature_extraction.text import HashingVectorizer
from sqlalchemy import select
from sqlalchemy.orm import Session
from ..config import get_settings
from ..models import Chunk

settings = get_settings()


def _normalize(v: np.ndarray) -> np.ndarray:
    norm = float(np.linalg.norm(v))
    return v if norm == 0 else v / norm


class LocalHashingEmbedder:
    """Offline fixed-width dense vectorizer used as the safe demo fallback.

    It is intentionally dependency-light and deterministic. For stronger semantic
    retrieval set EMBEDDING_BACKEND=sentence_transformers.
    """

    name = "local_hashing"

    def __init__(self, dimension: int = 384):
        self.dimension = dimension
        self.word = HashingVectorizer(
            n_features=dimension,
            alternate_sign=False,
            norm=None,
            stop_words="english",
            ngram_range=(1, 2),
            lowercase=True,
        )
        self.char = HashingVectorizer(
            analyzer="char_wb",
            n_features=dimension,
            alternate_sign=False,
            norm=None,
            ngram_range=(3, 5),
            lowercase=True,
        )

    def encode(self, texts: list[str]) -> np.ndarray:
        w = self.word.transform(texts).toarray().astype(np.float32)
        c = self.char.transform(texts).toarray().astype(np.float32)
        matrix = 0.78 * w + 0.22 * c
        return np.vstack([_normalize(v) for v in matrix])


class SentenceTransformerEmbedder:
    name = "sentence_transformers"

    def __init__(self, model_name: str):
        from sentence_transformers import SentenceTransformer  # optional extra
        self.model = SentenceTransformer(model_name)
        self.dimension = int(self.model.get_sentence_embedding_dimension())
        self.model_name = model_name

    def encode(self, texts: list[str]) -> np.ndarray:
        arr = self.model.encode(texts, normalize_embeddings=True, show_progress_bar=False)
        return np.asarray(arr, dtype=np.float32)


@lru_cache(maxsize=1)
def get_embedder():
    if settings.embedding_backend == "sentence_transformers":
        try:
            return SentenceTransformerEmbedder(settings.embedding_model)
        except Exception:
            # Production configuration can make this fail-fast externally; the
            # local demo degrades safely so the app remains runnable offline.
            return LocalHashingEmbedder(settings.embedding_dimension)
    return LocalHashingEmbedder(settings.embedding_dimension)


def embedder_status() -> dict:
    emb = get_embedder()
    return {
        "requested_backend": settings.embedding_backend,
        "active_backend": emb.name,
        "model": getattr(emb, "model_name", emb.name),
        "dimension": int(getattr(emb, "dimension", settings.embedding_dimension)),
        "semantic_model_active": emb.name == "sentence_transformers",
    }


def serialize_embedding(vector: Iterable[float]) -> str:
    return json.dumps([round(float(x), 7) for x in vector], separators=(",", ":"))


def deserialize_embedding(raw: str | None) -> np.ndarray | None:
    if not raw:
        return None
    try:
        return np.asarray(json.loads(raw), dtype=np.float32)
    except Exception:
        return None


def ensure_embeddings(db: Session, chunks: list[Chunk] | None = None, force: bool = False) -> int:
    emb = get_embedder()
    if chunks is None:
        chunks = list(db.scalars(select(Chunk).order_by(Chunk.id)).all())
    pending = [c for c in chunks if force or not c.embedding_json or c.embedding_model != emb.name]
    if not pending:
        return 0
    vectors = emb.encode([c.text for c in pending])
    for chunk, vector in zip(pending, vectors):
        chunk.embedding_json = serialize_embedding(vector)
        chunk.embedding_model = emb.name
    db.commit()
    return len(pending)


def cosine(a: np.ndarray, b: np.ndarray) -> float:
    if a.size == 0 or b.size == 0:
        return 0.0
    denom = math.sqrt(float(np.dot(a, a))) * math.sqrt(float(np.dot(b, b)))
    if denom == 0:
        return 0.0
    return float(np.dot(a, b) / denom)
