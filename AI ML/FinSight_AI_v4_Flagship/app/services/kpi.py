from __future__ import annotations
import re
from collections import defaultdict
from sqlalchemy import or_, select
from sqlalchemy.orm import Session
from ..models import Chunk, Document

KPI_PATTERNS = {
    "revenue": re.compile(r"\b(?:revenue|sales)\b[^.\n]{0,80}?([+-]?\$?\d+(?:\.\d+)?\s?(?:billion|million|bn|m|%))", re.I),
    "net_income": re.compile(r"\bnet income\b[^.\n]{0,80}?([+-]?\$?\d+(?:\.\d+)?\s?(?:billion|million|bn|m|%))", re.I),
    "ebitda": re.compile(r"\bEBITDA\b[^.\n]{0,80}?([+-]?\$?\d+(?:\.\d+)?\s?(?:billion|million|bn|m|%))", re.I),
    "eps": re.compile(r"\b(?:EPS|earnings per share)\b[^.\n]{0,80}?([+-]?\$?\d+(?:\.\d+)?)", re.I),
    "gross_margin": re.compile(r"\bgross margin\b[^.\n]{0,80}?([+-]?\d+(?:\.\d+)?%)", re.I),
    "operating_margin": re.compile(r"\boperating margin\b[^.\n]{0,80}?([+-]?\d+(?:\.\d+)?%)", re.I),
    "free_cash_flow": re.compile(r"\bfree cash flow\b[^.\n]{0,80}?([+-]?\$?\d+(?:\.\d+)?\s?(?:billion|million|bn|m|%))", re.I),
}

GROWTH_PATTERNS = {
    "revenue_growth": re.compile(r"\brevenue\b[^.\n]{0,80}?\b(?:grew|growth|increased|rose|improved)\b[^.\n]{0,50}?(\d+(?:\.\d+)?%)", re.I),
    "sales_growth": re.compile(r"\b(?:digital )?sales\b[^.\n]{0,80}?\b(?:grew|growth|increased|rose)\b[^.\n]{0,50}?(\d+(?:\.\d+)?%)", re.I),
}


def _docs(db: Session, user_id: int | None, company: str | None = None):
    stmt = select(Document)
    if user_id is not None:
        stmt = stmt.where(or_(Document.uploaded_by.is_(None), Document.uploaded_by == user_id))
    if company:
        stmt = stmt.where(Document.company.ilike(f"%{company}%"))
    return db.scalars(stmt.order_by(Document.company, Document.created_at.desc())).all()


def extract_kpis(db: Session, user_id: int | None = None, company: str | None = None) -> list[dict]:
    output = []
    for doc in _docs(db, user_id, company):
        chunks = db.scalars(select(Chunk).where(Chunk.document_id == doc.id).order_by(Chunk.chunk_index)).all()
        text = "\n".join(c.text for c in chunks)
        metrics = []
        for name, pattern in {**KPI_PATTERNS, **GROWTH_PATTERNS}.items():
            for match in pattern.finditer(text):
                sentence_start = max(text.rfind(".", 0, match.start()) + 1, 0)
                sentence_end = text.find(".", match.end())
                sentence_end = len(text) if sentence_end == -1 else sentence_end + 1
                metrics.append({
                    "metric": name,
                    "value": match.group(1).strip(),
                    "evidence": text[sentence_start:sentence_end].strip()[:350],
                })
        output.append({"document_id": doc.id, "company": doc.company, "document": doc.filename, "metrics": metrics[:20]})
    return output


def latest_company_kpis(db: Session, user_id: int | None, company: str) -> dict:
    rows = extract_kpis(db, user_id, company)
    merged = defaultdict(list)
    for row in rows:
        for metric in row["metrics"]:
            merged[metric["metric"]].append({"value": metric["value"], "evidence": metric["evidence"], "document": row["document"]})
    return {"company": company, "kpis": dict(merged)}
