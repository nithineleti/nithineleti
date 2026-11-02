from __future__ import annotations
import json
import re
from pathlib import Path
from sqlalchemy import delete, select
from sqlalchemy.orm import Session
from ..config import BASE_DIR
from ..models import EarningsUtterance
from .guidance import GUIDANCE_TERMS

POS = {"growth","strong","improved","improvement","expand","expanded","protect","support","well","higher","renewal","renewals","opportunity","confidence","profitable"}
NEG = {"risk","risks","cautious","delay","delays","uncertainty","higher cost","pressure","weak","weaker","markdown","volatility","longer","shortage"}


def _score(text: str) -> float:
    lower = text.lower()
    score = 0.0
    for term in POS:
        if term in lower:
            score += 1
    for term in NEG:
        if term in lower:
            score -= 1
    denom = max(3.0, sum(1 for x in POS | NEG if x in lower))
    return round(max(-1.0, min(1.0, score / denom)), 3)


def seed_earnings(db: Session, path: Path | None = None) -> int:
    if db.scalar(select(EarningsUtterance.id).limit(1)):
        return 0
    path = path or (BASE_DIR / "data" / "earnings_transcripts.json")
    rows = json.loads(path.read_text())
    for row in rows:
        db.add(EarningsUtterance(**row, source="bundled_demo"))
    db.commit()
    return len(rows)


def analyze_earnings(db: Session, company: str | None = None, period: str | None = None) -> dict:
    stmt = select(EarningsUtterance)
    if company:
        stmt = stmt.where(EarningsUtterance.company.ilike(f"%{company}%"))
    if period:
        stmt = stmt.where(EarningsUtterance.period == period)
    rows = db.scalars(stmt.order_by(EarningsUtterance.company, EarningsUtterance.period, EarningsUtterance.id)).all()
    if not rows:
        return {"company": company, "period": period, "utterances": [], "summary": None}
    enriched = []
    mgmt_scores, analyst_scores = [], []
    guidance = []
    questions = []
    uncertainty = []
    for row in rows:
        s = _score(row.text)
        item = {"speaker": row.speaker, "role": row.role, "text": row.text, "sentiment": s, "period": row.period, "company": row.company}
        enriched.append(item)
        if row.role == "management":
            mgmt_scores.append(s)
        else:
            analyst_scores.append(s)
            if "?" in row.text:
                questions.append(row.text)
        lower = row.text.lower()
        if any(term in lower for term in GUIDANCE_TERMS):
            guidance.append(row.text)
        if any(term in lower for term in ["cautious","uncertainty","risk","delay","volatility","longer than planned","pressure"]):
            uncertainty.append(row.text)
    avg = lambda xs: round(sum(xs)/len(xs), 3) if xs else None
    company_name = rows[0].company if rows else company
    periods = sorted(set(r.period for r in rows))
    return {
        "company": company_name,
        "periods": periods,
        "utterances": enriched,
        "summary": {
            "management_sentiment": avg(mgmt_scores),
            "analyst_sentiment": avg(analyst_scores),
            "guidance_mentions": len(guidance),
            "analyst_questions": len(questions),
            "uncertainty_mentions": len(uncertainty),
            "guidance": guidance[:8],
            "questions": questions[:8],
            "uncertainty": uncertainty[:8],
        },
    }


def topic_map(db: Session, company: str | None = None) -> list[dict]:
    data = analyze_earnings(db, company)
    topics = {
        "growth": ["growth","renewal","sales","revenue","digital","capacity"],
        "margin": ["margin","cost","freight","support automation","utilization"],
        "risk": ["risk","uncertainty","delay","volatility","inventory","acquisition cost"],
        "guidance": ["expect","next year","next two years","next quarter","outlook"],
        "capital": ["cash flow","capex","financing","interest","investment"],
    }
    counts = {k: 0 for k in topics}
    evidence = {k: [] for k in topics}
    for u in data.get("utterances", []):
        low = u["text"].lower()
        for topic, terms in topics.items():
            if any(t in low for t in terms):
                counts[topic] += 1
                if len(evidence[topic]) < 2:
                    evidence[topic].append(u["text"])
    return [{"topic": k, "mentions": counts[k], "evidence": evidence[k]} for k in topics if counts[k]]
