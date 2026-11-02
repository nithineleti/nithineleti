from __future__ import annotations
import re
from sqlalchemy import or_, select
from sqlalchemy.orm import Session
from ..models import Chunk, Document

GUIDANCE_TERMS = [
    "expect", "expects", "expected", "outlook", "guidance", "anticipate", "anticipates",
    "target", "targets", "plan to", "plans to", "next year", "next fiscal", "next quarter",
    "over the next", "forecast", "projected", "pipeline", "growth driver",
]


def extract_guidance(db: Session, user_id: int | None = None, company: str | None = None) -> list[dict]:
    stmt = select(Document)
    if user_id is not None:
        stmt = stmt.where(or_(Document.uploaded_by.is_(None), Document.uploaded_by == user_id))
    if company:
        stmt = stmt.where(Document.company.ilike(f"%{company}%"))
    docs = db.scalars(stmt.order_by(Document.company)).all()
    output = []
    for doc in docs:
        chunks = db.scalars(select(Chunk).where(Chunk.document_id == doc.id)).all()
        sentences = []
        for chunk in chunks:
            for sentence in re.split(r"(?<=[.!?])\s+", chunk.text):
                s = sentence.strip()
                lower = s.lower()
                if len(s) >= 24 and any(term in lower for term in GUIDANCE_TERMS):
                    direction = "positive" if any(x in lower for x in ["growth", "improve", "expand", "larger", "support"]) else "mixed"
                    sentences.append({"evidence": s[:500], "direction": direction, "document": doc.filename})
        output.append({"company": doc.company, "document_id": doc.id, "guidance": sentences[:12]})
    return output
