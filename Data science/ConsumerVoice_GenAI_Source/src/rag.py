from __future__ import annotations

import os

import numpy as np
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import linear_kernel

from .config import LOCAL_LLM_MODEL
from .privacy import redact_pii


class LocalReviewRAG:
    """Privacy-aware local retrieval with optional open-source generation."""

    def __init__(self, feedback: pd.DataFrame, bundle):
        self.feedback = feedback.reset_index(drop=True).copy()
        self.feedback["text"] = self.feedback["text"].map(lambda value: redact_pii(value)[0])
        self.bundle = bundle
        self.documents = self.feedback.apply(
            lambda r: f"Product: {r['product']}. Region: {r['region']}. Channel: {r['channel']}. Feedback: {r['text']}", axis=1
        ).tolist()
        self.vectorizer = TfidfVectorizer(ngram_range=(1, 2), min_df=2, max_features=12000, sublinear_tf=True)
        self.matrix = self.vectorizer.fit_transform(self.documents)
        self.generator = None

    def _load_generator(self):
        if self.generator is not None or os.getenv("ENABLE_LOCAL_LLM", "0") != "1":
            return self.generator
        try:
            from transformers import pipeline
            self.generator = pipeline("text2text-generation", model=LOCAL_LLM_MODEL)
        except Exception:
            self.generator = False
        return self.generator

    def retrieve(self, query: str, top_k: int = 6) -> pd.DataFrame:
        scores = linear_kernel(self.vectorizer.transform([query]), self.matrix).ravel()
        indices = np.argsort(scores)[-top_k:][::-1]
        result = self.feedback.iloc[indices][["feedback_id", "date", "product", "region", "channel", "text"]].copy()
        result["relevance"] = scores[indices].round(3)
        result["citation"] = [f"R{i + 1}" for i in range(len(result))]
        return result.reset_index(drop=True)

    def answer(self, query: str, top_k: int = 6) -> tuple[str, pd.DataFrame]:
        evidence = self.retrieve(query, top_k)
        analyses = [self.bundle.analyze(text) for text in evidence["text"]]
        sentiments = pd.Series([row["sentiment"] for row in analyses])
        topics = pd.Series([row["topic"] for row in analyses])
        urgent_count = sum(row["urgent"] for row in analyses)
        generator = self._load_generator()

        if generator:
            context = "\n".join(f"[{row.citation}] {row.text}" for row in evidence.itertuples())
            prompt = (
                "Answer the business question using only the evidence. Cite sources like [R1]. "
                "If evidence is weak, say so.\nQuestion: " + query + "\nEvidence:\n" + context
            )
            generated = generator(prompt, max_new_tokens=180, do_sample=False)[0]["generated_text"]
            answer = f"### Local LLM answer\n{generated}"
        else:
            dominant_sentiment = sentiments.mode().iloc[0]
            dominant_topic = topics.mode().iloc[0]
            product_counts = evidence["product"].value_counts()
            leading_product = product_counts.index[0]
            citations = ", ".join(f"[{value}]" for value in evidence["citation"].head(4))
            answer = (
                f"### Grounded consumer insight\nAmong the {len(evidence)} most relevant records, the dominant sentiment is "
                f"**{dominant_sentiment}** and the leading topic is **{dominant_topic.replace('_', ' ')}**. "
                f"**{leading_product}** appears most often, and **{urgent_count}** retrieved records require urgent review. "
                f"Evidence: {citations}.\n\n"
                "**Recommended action:** Review the cited examples, validate the pattern against the full dashboard, and assign urgent cases to the responsible product or service team. "
                "The default generator is fully offline; set `ENABLE_LOCAL_LLM=1` to use FLAN-T5 for generative wording."
            )
        evidence = evidence[["citation", "feedback_id", "product", "region", "channel", "relevance", "text"]]
        return answer, evidence
