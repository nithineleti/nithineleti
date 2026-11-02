from __future__ import annotations
import json
import time
from pathlib import Path
from sqlalchemy.orm import Session
from .retrieval import retriever


def _evaluate_mode(db: Session, cases: list[dict], mode: str, user_id: int | None) -> dict:
    hits = 0
    reciprocal_ranks = []
    latencies = []
    details = []
    for case in cases:
        start = time.perf_counter()
        results = retriever.search(db, case["question"], top_k=5, min_score=0.0, user_id=user_id, mode=mode)
        latencies.append((time.perf_counter() - start) * 1000)
        expected = case["expected_document"]
        relevant = case.get("relevant_documents") or [expected]
        rank = next((i for i, result in enumerate(results, 1) if any(doc in result["document"] for doc in relevant)), None)
        if rank is not None:
            hits += 1
            reciprocal_ranks.append(1 / rank)
        else:
            reciprocal_ranks.append(0.0)
        details.append({"question": case["question"], "expected_document": expected, "relevant_documents": relevant, "rank": rank})
    total = max(1, len(cases))
    return {
        "cases": len(cases),
        "top5_hit_rate": round(hits / total, 3),
        "mean_reciprocal_rank": round(sum(reciprocal_ranks) / total, 3),
        "avg_latency_ms": round(sum(latencies) / max(1, len(latencies)), 2),
        "details": details,
    }


def evaluate_retrieval(db: Session, eval_path: Path, user_id: int | None = None) -> dict:
    cases = json.loads(eval_path.read_text())
    modes = {mode: _evaluate_mode(db, cases, mode, user_id) for mode in ["bm25", "dense", "hybrid"]}
    return {"cases": len(cases), "modes": modes, "recommended_mode": "hybrid"}
