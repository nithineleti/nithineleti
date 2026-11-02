from __future__ import annotations
import re
from sqlalchemy import or_, select
from sqlalchemy.orm import Session
from ..models import Chunk, Document

RISK_TERMS = {
    "demand": ["demand", "discretionary spending", "sales cycle", "customer churn"],
    "cost": ["cost", "expense", "freight", "acquisition cost", "inflation"],
    "operations": ["delay", "lead time", "shortage", "outage", "capacity"],
    "market": ["volatility", "price volatility", "competition", "uncertainty"],
    "regulatory": ["permit", "regulatory", "compliance", "approval"],
    "financial": ["interest", "financing", "debt", "liquidity", "cash flow"],
}


def risk_analysis(db: Session, user_id: int | None = None, company: str | None = None) -> list[dict]:
    stmt = select(Document)
    if user_id is not None:
        stmt = stmt.where(or_(Document.uploaded_by.is_(None), Document.uploaded_by == user_id))
    if company:
        stmt = stmt.where(Document.company.ilike(f"%{company}%"))
    docs = db.scalars(stmt.order_by(Document.company)).all()
    output = []
    for doc in docs:
        chunks = db.scalars(select(Chunk).where(Chunk.document_id == doc.id)).all()
        text = " ".join(c.text for c in chunks)
        sentences = [s.strip() for s in re.split(r"(?<=[.!?])\s+", text) if len(s.strip()) > 20]
        findings = []
        for sentence in sentences:
            lower = sentence.lower()
            cats = [cat for cat, terms in RISK_TERMS.items() if any(term in lower for term in terms)]
            explicit = any(x in lower for x in ["risk", "risks", "uncertainty", "delay", "volatility", "weaker", "pressure"])
            if cats and explicit:
                severity = "high" if len(cats) >= 2 or any(x in lower for x in ["primary risk", "key risk", "main near-term risk"]) else "medium"
                findings.append({"categories": cats, "severity": severity, "evidence": sentence[:420]})
        output.append({"document_id": doc.id, "company": doc.company, "document": doc.filename, "risks": findings[:10]})
    return output
