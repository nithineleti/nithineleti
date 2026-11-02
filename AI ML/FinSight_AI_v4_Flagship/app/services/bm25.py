from __future__ import annotations
import math
import re
from collections import Counter

TOKEN_RE = re.compile(r"[A-Za-z0-9%$.-]+")


def tokenize(text: str) -> list[str]:
    return [t.lower() for t in TOKEN_RE.findall(text)]


class BM25Index:
    def __init__(self, documents: list[str], k1: float = 1.5, b: float = 0.75):
        self.docs = [tokenize(x) for x in documents]
        self.k1 = k1
        self.b = b
        self.avgdl = sum(map(len, self.docs)) / max(1, len(self.docs))
        self.tf = [Counter(doc) for doc in self.docs]
        df = Counter()
        for doc in self.docs:
            df.update(set(doc))
        n = max(1, len(self.docs))
        self.idf = {term: math.log(1 + (n - freq + 0.5) / (freq + 0.5)) for term, freq in df.items()}

    def scores(self, query: str) -> list[float]:
        q = tokenize(query)
        out = []
        for doc, tf in zip(self.docs, self.tf):
            dl = max(1, len(doc))
            score = 0.0
            for term in q:
                freq = tf.get(term, 0)
                if not freq:
                    continue
                idf = self.idf.get(term, 0.0)
                denom = freq + self.k1 * (1 - self.b + self.b * dl / max(self.avgdl, 1e-9))
                score += idf * (freq * (self.k1 + 1)) / denom
            out.append(float(score))
        return out
