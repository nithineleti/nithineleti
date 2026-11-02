from __future__ import annotations

import pandas as pd

from .data import PRODUCTS, load_feedback
from .modeling import load_bundle
from .rag import LocalReviewRAG


class ConsumerVoiceService:
    def __init__(self):
        self.feedback = load_feedback()
        self.bundle = load_bundle()
        self.rag = LocalReviewRAG(self.feedback, self.bundle)

    @property
    def products(self):
        return ["All products"] + PRODUCTS

    def analyze(self, text: str) -> dict:
        if not text or len(text.strip()) < 8:
            raise ValueError("Enter at least eight characters of customer feedback")
        return self.bundle.analyze(text)

    def ask(self, question: str):
        if not question or len(question.strip()) < 5:
            raise ValueError("Enter a specific consumer-insight question")
        return self.rag.answer(question)

    def dashboard(self, product: str = "All products") -> tuple[pd.DataFrame, pd.DataFrame, dict]:
        frame = self.feedback if product == "All products" else self.feedback[self.feedback["product"].eq(product)]
        monthly = (
            frame.assign(month=frame["date"].dt.to_period("M").astype(str))
            .groupby(["month", "sentiment"], as_index=False)
            .size()
            .rename(columns={"size": "feedback_count"})
        )
        topics = (
            frame.groupby(["topic", "sentiment"], as_index=False)
            .size().rename(columns={"size": "feedback_count"})
            .sort_values("feedback_count", ascending=False)
        )
        kpis = {
            "feedback": int(len(frame)),
            "negative_pct": float(frame["sentiment"].eq("negative").mean() * 100),
            "urgent_cases": int(frame["urgent"].sum()),
            "average_rating": float(frame["rating"].mean()),
        }
        return monthly, topics, kpis
