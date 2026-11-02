from __future__ import annotations
import json
import math
import re
import time
from pathlib import Path
from sqlalchemy.orm import Session
from .generator import generator, validate_citations
from .retrieval import retriever


def _support_score(answer: str, sources: list[dict]) -> float:
    source_terms = set(re.findall(r"[a-zA-Z]{4,}", " ".join(s["text"] for s in sources).lower()))
    answer_terms = [x for x in re.findall(r"[a-zA-Z]{4,}", answer.lower()) if x not in {"with","from","that","this","were","have","which","their","company"}]
    if not answer_terms:
        return 1.0
    return min(1.0, sum(1 for x in answer_terms if x in source_terms) / len(answer_terms))


def _citation_precision(answer: str, source_count: int) -> float:
    found = [int(x) for x in re.findall(r"\[S(\d+)\]", answer)]
    if not found:
        return 0.0
    return sum(1 for x in found if 1 <= x <= source_count) / len(found)


def _citation_recall(answer: str) -> float:
    paragraphs = [p.strip() for p in answer.split("\n") if len(re.findall(r"[A-Za-z]{3,}", p)) >= 5]
    if not paragraphs:
        return 1.0
    return sum(1 for p in paragraphs if re.search(r"\[S\d+\]", p)) / len(paragraphs)


def evaluate_system(db: Session, eval_path: Path, user_id: int | None = None) -> dict:
    cases = json.loads(eval_path.read_text())
    modes = {}
    for mode in ["bm25", "dense", "hybrid", "graph_hybrid"]:
        ranks, latencies, precisions, ndcgs = [], [], [], []
        for case in cases:
            t0 = time.perf_counter()
            results = retriever.search(db, case["question"], top_k=5, min_score=0.0, user_id=user_id, mode=mode)
            latencies.append((time.perf_counter() - t0) * 1000)
            relevant = case.get("relevant_documents") or [case["expected_document"]]
            rank = next((i for i, x in enumerate(results, 1) if any(doc in x["document"] for doc in relevant)), None)
            ranks.append(rank)
            precisions.append((1/5) if rank is not None else 0.0)
            ndcgs.append((1 / math.log2(rank + 1)) if rank is not None else 0.0)
        hits = sum(1 for x in ranks if x is not None)
        mrr = sum((1/x if x else 0.0) for x in ranks) / max(1, len(ranks))
        modes[mode] = {
            "recall_at_5": round(hits / max(1, len(cases)), 3),
            "precision_at_5": round(sum(precisions) / max(1, len(precisions)), 3),
            "mrr": round(mrr, 3),
            "ndcg_at_5": round(sum(ndcgs) / max(1, len(ndcgs)), 3),
            "avg_latency_ms": round(sum(latencies) / max(1, len(latencies)), 2),
            "ranks": ranks,
        }

    # End-to-end grounding evaluation on the strongest mode.
    answer_rows = []
    for case in cases:
        sources = retriever.search(db, case["question"], top_k=5, min_score=0.0, user_id=user_id, mode="graph_hybrid")
        generated = generator.generate(case["question"], sources)
        answer = generated["answer"]
        val = validate_citations(answer, len(sources))
        answer_rows.append({
            "question": case["question"],
            "citation_precision": _citation_precision(answer, len(sources)),
            "citation_recall": _citation_recall(answer),
            "faithfulness_proxy": _support_score(answer, sources),
            "citation_valid": val["valid"],
        })
    avg = lambda key: round(sum(x[key] for x in answer_rows) / max(1, len(answer_rows)), 3)
    end_to_end = {
        "citation_precision": avg("citation_precision"),
        "citation_recall": avg("citation_recall"),
        "faithfulness_proxy": avg("faithfulness_proxy"),
        "citation_validation_pass_rate": round(sum(1 for x in answer_rows if x["citation_valid"]) / max(1, len(answer_rows)), 3),
        "hallucination_proxy_rate": round(1 - avg("faithfulness_proxy"), 3),
        "details": answer_rows,
    }
    recommended = max(modes, key=lambda m: (modes[m]["mrr"], modes[m]["recall_at_5"]))
    return {"cases": len(cases), "modes": modes, "end_to_end": end_to_end, "recommended_mode": recommended, "metric_note": "Faithfulness/hallucination are lexical proxies in the offline demo; use a labeled evaluation set or judge model for production."}
