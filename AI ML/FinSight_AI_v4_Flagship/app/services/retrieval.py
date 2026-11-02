from __future__ import annotations
import re
import time
import numpy as np
from sqlalchemy import or_, select
from sqlalchemy.orm import Session
from ..config import get_settings
from ..models import Chunk, Document
from .bm25 import BM25Index
from .embeddings import cosine, deserialize_embedding, ensure_embeddings, get_embedder
from .reranker import get_reranker, reranker_status

settings = get_settings()


def _normalize(values: list[float]) -> list[float]:
    if not values:
        return []
    lo, hi = min(values), max(values)
    if hi <= lo:
        return [1.0 if hi > 0 else 0.0 for _ in values]
    return [(x - lo) / (hi - lo) for x in values]


def _graph_boost_terms(db: Session, question: str, company: str | None) -> tuple[set[str], dict]:
    try:
        from .graph_rag import query_graph
        graph = query_graph(db, question, company, max_nodes=16)
        terms = set()
        for node in graph.get("nodes", []):
            terms.update(re.findall(r"[a-zA-Z]{3,}", node.get("name", "").lower()))
        for ev in graph.get("evidence", []):
            terms.update(re.findall(r"[a-zA-Z]{4,}", ev.lower()))
        # Keep only a compact set of graph-derived context tokens.
        qterms = set(re.findall(r"[a-zA-Z]{3,}", question.lower()))
        prioritized = list(qterms & terms) + list(terms - qterms)
        return set(prioritized[:80]), graph
    except Exception:
        return set(), {"nodes": [], "edges": [], "evidence": []}


class RetrievalEngine:
    def _rows(self, db: Session, company: str | None, user_id: int | None):
        stmt = select(Chunk, Document).join(Document, Document.id == Chunk.document_id)
        if user_id is not None:
            stmt = stmt.where(or_(Document.uploaded_by.is_(None), Document.uploaded_by == user_id))
        if company:
            stmt = stmt.where(Document.company.ilike(f"%{company.strip()}%"))
        return db.execute(stmt.order_by(Document.id, Chunk.chunk_index)).all()

    def search(
        self,
        db: Session,
        question: str,
        top_k: int = 5,
        company: str | None = None,
        min_score: float = 0.0,
        user_id: int | None = None,
        mode: str = "hybrid",
    ) -> list[dict]:
        started = time.perf_counter()
        rows = self._rows(db, company, user_id)
        if not rows:
            return []
        chunks = [r.Chunk for r in rows]
        ensure_embeddings(db, chunks)
        texts = [c.text for c in chunks]

        bm25_raw = BM25Index(texts).scores(question)
        bm25_norm = _normalize(bm25_raw)

        q_vec = get_embedder().encode([question])[0]
        dense_raw: list[float] = []
        for chunk in chunks:
            vec = deserialize_embedding(chunk.embedding_json)
            dense_raw.append(max(0.0, cosine(q_vec, vec)) if vec is not None else 0.0)
        dense_norm = _normalize(dense_raw)

        graph_terms, graph_payload = (set(), {"nodes": [], "edges": [], "evidence": []})
        if mode == "graph_hybrid":
            graph_terms, graph_payload = _graph_boost_terms(db, question, company)
        graph_raw = []
        for text in texts:
            t = set(re.findall(r"[a-zA-Z]{3,}", text.lower()))
            graph_raw.append(len(graph_terms & t) / max(1, min(20, len(graph_terms))))
        graph_norm = _normalize(graph_raw)

        items = []
        for i, row in enumerate(rows):
            chunk, doc = row.Chunk, row.Document
            if mode == "bm25":
                base = bm25_norm[i]
            elif mode == "dense":
                base = dense_norm[i]
            else:
                graph_w = settings.graph_weight if mode == "graph_hybrid" else 0.0
                denom = max(1e-9, settings.bm25_weight + settings.dense_weight + graph_w)
                base = (
                    settings.bm25_weight * bm25_norm[i]
                    + settings.dense_weight * dense_norm[i]
                    + graph_w * graph_norm[i]
                ) / denom
            items.append({
                "chunk_id": chunk.id,
                "document_id": doc.id,
                "document": doc.filename,
                "company": doc.company,
                "document_type": doc.document_type,
                "page": chunk.page_number,
                "line_start": chunk.line_start,
                "line_end": chunk.line_end,
                "text": chunk.text,
                "bm25_score": round(float(bm25_raw[i]), 6),
                "bm25_norm": round(float(bm25_norm[i]), 6),
                "dense_score": round(float(dense_raw[i]), 6),
                "dense_norm": round(float(dense_norm[i]), 6),
                "graph_score": round(float(graph_raw[i]), 6),
                "hybrid_score": round(float(base), 6),
            })

        candidate_k = min(len(items), max(top_k * 5, settings.retrieval_candidate_k))
        candidates = sorted(items, key=lambda x: x["hybrid_score"], reverse=True)[:candidate_k]
        if mode in {"hybrid", "graph_hybrid"}:
            ranked = get_reranker().rerank(question, candidates)
            for item in ranked:
                item["score"] = round(
                    (1.0 - settings.rerank_weight) * item["hybrid_score"]
                    + settings.rerank_weight * item.get("rerank_score", 0.0),
                    6,
                )
            ranked.sort(key=lambda x: x["score"], reverse=True)
        else:
            ranked = candidates
            for item in ranked:
                item["rerank_score"] = None
                item["score"] = item["hybrid_score"]

        results = [x for x in ranked if x["score"] >= min_score][:top_k]
        latency = round((time.perf_counter() - started) * 1000, 2)
        for rank, item in enumerate(results, 1):
            item["rank"] = rank
            item["retrieval_mode"] = mode
            item["latency_ms"] = latency
            if mode == "graph_hybrid":
                item["graph_context_nodes"] = len(graph_payload.get("nodes", []))
        return results

    def status(self) -> dict:
        emb = get_embedder()
        return {
            "mode": settings.retrieval_mode,
            "supported_modes": ["bm25", "dense", "hybrid", "graph_hybrid"],
            "embedding_backend": emb.name,
            "embedding_model": getattr(emb, "model_name", emb.name),
            "embedding_dimension": int(getattr(emb, "dimension", settings.embedding_dimension)),
            "reranker": reranker_status(),
            "weights": {
                "dense": settings.dense_weight,
                "bm25": settings.bm25_weight,
                "rerank": settings.rerank_weight,
                "graph": settings.graph_weight,
            },
        }


retriever = RetrievalEngine()
