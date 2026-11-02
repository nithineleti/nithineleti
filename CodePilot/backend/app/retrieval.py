from __future__ import annotations

import math
import re

from .indexer import CodeChunk, embed

WORD_RE = re.compile(r"[A-Za-z_][A-Za-z0-9_]{1,}|\d+(?:\.\d+)?")


def cosine(a: list[float], b: list[float]) -> float:
    return sum(x * y for x, y in zip(a, b))


def retrieve(chunks: list[CodeChunk], query: str, limit: int = 8) -> list[dict]:
    qv = embed(query)
    q_tokens = set(WORD_RE.findall(query.lower()))
    scored: list[tuple[float, CodeChunk]] = []
    for chunk in chunks:
        semantic = cosine(qv, chunk.vector)
        c_tokens = set(WORD_RE.findall((chunk.path + " " + chunk.symbol + " " + chunk.text).lower()))
        overlap = len(q_tokens & c_tokens) / max(1, len(q_tokens))
        path_lower = chunk.path.lower()
        path_bonus = 0.07 if any(tok in path_lower for tok in q_tokens if len(tok) > 4) else 0.0
        source_bonus = 0.045 if not any(part.startswith("test") or part == "tests" for part in path_lower.split("/")) else -0.055
        score = 0.72 * semantic + 0.28 * overlap + path_bonus + source_bonus
        scored.append((score, chunk))
    scored.sort(key=lambda item: item[0], reverse=True)
    return [chunk.public(score) for score, chunk in scored[:limit]]
