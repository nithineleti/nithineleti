from __future__ import annotations
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from sqlalchemy import select
from sqlalchemy.orm import Session
from ..config import BASE_DIR
from ..models import NewsEvent

EVENT_TERMS = {
    "earnings": ["earnings", "revenue", "profit", "quarter"],
    "guidance": ["guidance", "outlook", "forecast", "deal cycles"],
    "partnership": ["partnership", "partner", "alliance"],
    "acquisition": ["acquire", "acquisition", "merger"],
    "regulatory": ["regulatory", "permit", "approval", "investigation"],
    "operations": ["automation", "operations", "factory", "logistics"],
    "inventory": ["inventory", "markdown"],
    "project_launch": ["commission", "launch", "commercial operation", "project"],
    "leadership": ["ceo", "cfo", "chief executive", "appoint"],
    "legal": ["lawsuit", "litigation", "court"],
}
POSITIVE = ["expands","growth","ahead","improves","accelerates","wins","strong","launch","commission"]
NEGATIVE = ["delay","weak","risk","falls","decline","investigation","elevated","markdown","extended","loss"]


def classify_headline(headline: str) -> dict:
    lower = headline.lower()
    scores = {etype: sum(1 for t in terms if t in lower) for etype, terms in EVENT_TERMS.items()}
    event_type = max(scores, key=scores.get) if max(scores.values(), default=0) else "other"
    sentiment_raw = sum(1 for t in POSITIVE if t in lower) - sum(1 for t in NEGATIVE if t in lower)
    sentiment = max(-1.0, min(1.0, sentiment_raw / 3.0))
    impact = min(1.0, 0.45 + 0.08 * max(scores.values(), default=0) + 0.12 * abs(sentiment))
    return {"event_type": event_type, "sentiment": round(sentiment, 3), "impact_score": round(impact, 3)}


def seed_news(db: Session, path: Path | None = None) -> int:
    if db.scalar(select(NewsEvent.id).limit(1)):
        return 0
    path = path or (BASE_DIR / "data" / "news_events.json")
    rows = json.loads(path.read_text())
    for row in rows:
        published = datetime.fromisoformat(row.pop("published_at"))
        db.add(NewsEvent(**row, published_at=published))
    db.commit()
    return len(rows)


def add_news_event(db: Session, company: str, headline: str, ticker: str | None = None, source: str = "manual", source_url: str | None = None) -> NewsEvent:
    c = classify_headline(headline)
    event = NewsEvent(
        company=company.strip(), ticker=(ticker or "").upper() or None, headline=headline.strip(),
        source=source, source_url=source_url, published_at=datetime.now(timezone.utc), **c,
    )
    db.add(event); db.commit(); db.refresh(event)
    return event


def list_news(db: Session, company: str | None = None, ticker: str | None = None, limit: int = 30) -> list[dict]:
    stmt = select(NewsEvent)
    if company:
        stmt = stmt.where(NewsEvent.company.ilike(f"%{company}%"))
    if ticker:
        stmt = stmt.where(NewsEvent.ticker == ticker.upper())
    rows = db.scalars(stmt.order_by(NewsEvent.published_at.desc()).limit(limit)).all()
    return [{
        "id": r.id, "company": r.company, "ticker": r.ticker, "headline": r.headline,
        "event_type": r.event_type, "sentiment": r.sentiment, "impact_score": r.impact_score,
        "published_at": r.published_at, "source": r.source, "source_url": r.source_url,
    } for r in rows]


def event_signal(db: Session, company: str) -> dict:
    events = list_news(db, company=company, limit=20)
    if not events:
        return {"company": company, "event_count": 0, "weighted_sentiment": 0.0, "high_impact": []}
    denom = sum(max(0.01, e["impact_score"]) for e in events)
    weighted = sum(e["sentiment"] * e["impact_score"] for e in events) / denom
    return {
        "company": company,
        "event_count": len(events),
        "weighted_sentiment": round(weighted, 3),
        "high_impact": [e for e in events if e["impact_score"] >= 0.65][:8],
    }
