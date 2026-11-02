from __future__ import annotations
from sqlalchemy.orm import Session
from .kpi import latest_company_kpis
from .risks import risk_analysis
from .sentiment import sentiment_by_document


def compare_companies(db: Session, user_id: int, companies: list[str]) -> dict:
    sentiment_rows = sentiment_by_document(db, user_id)
    out = []
    for company in companies:
        senti = [x for x in sentiment_rows if company.lower() in x["company"].lower()]
        risks = risk_analysis(db, user_id, company)
        kpis = latest_company_kpis(db, user_id, company)
        out.append({
            "company": company,
            "sentiment": senti[0] if senti else None,
            "kpis": kpis["kpis"],
            "risks": [r for doc in risks for r in doc["risks"]][:8],
        })
    return {"companies": out, "note": "Extracted from indexed documents; not investment advice."}
