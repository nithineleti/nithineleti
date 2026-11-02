from __future__ import annotations
import json
import time
from pathlib import Path
from sqlalchemy import select
from sqlalchemy.orm import Session
from ..config import BASE_DIR
from ..models import Document
from .anomalies import detect_anomalies
from .earnings import analyze_earnings, topic_map
from .forecasting import forecast_series, scenario_forecast
from .generator import generator
from .graph_rag import query_graph
from .guardrails import inspect_question, research_disclaimer
from .guidance import extract_guidance
from .kpi import latest_company_kpis
from .news import event_signal, list_news
from .retrieval import retriever
from .risks import risk_analysis
from .sentiment import sentiment_by_document
from .xbrl import get_company_facts, ratio_summary


def _profiles() -> list[dict]:
    return json.loads((BASE_DIR / "data" / "company_profiles.json").read_text())


def _series_map() -> dict:
    return json.loads((BASE_DIR / "data" / "company_series.json").read_text())


def _profile_for(company: str | None) -> dict | None:
    if not company:
        return None
    return next((p for p in _profiles() if company.lower() in p["company"].lower() or p["company"].lower() in company.lower()), None)


def _resolve_company(db: Session, company: str | None, question: str) -> str | None:
    if company:
        return company
    docs = db.scalars(select(Document).order_by(Document.company)).all()
    names = sorted(set(d.company for d in docs), key=len, reverse=True)
    return next((name for name in names if name.lower() in question.lower()), None)


def _plan(question: str, company: str | None, flags: dict) -> list[dict]:
    q = question.lower()
    tasks = [
        {"agent": "Evidence Retrieval Agent", "task": "Retrieve citation-ready evidence with hybrid sparse+dense+graph search", "required": True},
        {"agent": "Financial Fundamentals Agent", "task": "Extract KPIs, structured facts and margins", "required": True},
        {"agent": "Risk & Guidance Agent", "task": "Identify material risks, forward guidance and evidence", "required": True},
    ]
    if flags.get("include_earnings"):
        tasks.append({"agent": "Earnings Intelligence Agent", "task": "Analyze management/analyst tone, questions, uncertainty and guidance", "required": False})
    if flags.get("include_news"):
        tasks.append({"agent": "Event Intelligence Agent", "task": "Summarize recent company events and impact signals", "required": False})
    if flags.get("include_forecast") or any(x in q for x in ["forecast", "future", "outlook", "growth"]):
        tasks.append({"agent": "Forecast & Anomaly Agent", "task": "Compare forecasting models, build scenarios and flag anomalies", "required": False})
    if flags.get("include_graph"):
        tasks.append({"agent": "Graph Reasoning Agent", "task": "Traverse company-risk-product-driver relationships and return supporting paths", "required": False})
    tasks += [
        {"agent": "Verification Agent", "task": "Check citations, evidence coverage and guardrail signals", "required": True},
        {"agent": "Research Synthesis Agent", "task": "Produce concise evidence-grounded research output", "required": True},
    ]
    return tasks


def run_research_workflow(
    db: Session,
    user_id: int,
    question: str,
    company: str | None = None,
    horizon: int = 4,
    include_news: bool = True,
    include_earnings: bool = True,
    include_forecast: bool = True,
    include_graph: bool = True,
) -> dict:
    workflow_started = time.perf_counter()
    guard = inspect_question(question)
    if not guard["safe"]:
        raise ValueError("Potential prompt-injection instruction detected. Rephrase the request as a financial research question.")
    company = _resolve_company(db, company, question)
    flags = {"include_news": include_news, "include_earnings": include_earnings, "include_forecast": include_forecast, "include_graph": include_graph}
    trace = []

    def step(agent: str, fn):
        t0 = time.perf_counter()
        try:
            data = fn()
            status = "completed"
            error = None
        except Exception as exc:
            data = None
            status = "degraded"
            error = f"{type(exc).__name__}: {str(exc)[:160]}"
        trace.append({"agent": agent, "status": status, "duration_ms": round((time.perf_counter()-t0)*1000, 2), "error": error})
        return data

    plan = step("Research Planner Agent", lambda: _plan(question, company, flags))
    retrieval = step("Evidence Retrieval Agent", lambda: retriever.search(db, question, top_k=6, company=company, min_score=0.0, user_id=user_id, mode="graph_hybrid")) or []
    graph = step("Graph Reasoning Agent", lambda: query_graph(db, question, company, max_nodes=20)) if include_graph else None
    kpis = step("Financial Fundamentals Agent", lambda: latest_company_kpis(db, user_id, company)) if company else {"company": None, "kpis": {}}
    profile = _profile_for(company)
    xbrl = step("Structured XBRL Agent", lambda: get_company_facts(profile["ticker"], live=False)) if profile else None
    ratios = ratio_summary(xbrl) if xbrl else {}
    sentiments = step("Financial Sentiment Agent", lambda: sentiment_by_document(db, user_id)) or []
    company_sentiment = next((s for s in sentiments if company and company.lower() in s["company"].lower()), None)
    risks = step("Risk & Guidance Agent", lambda: risk_analysis(db, user_id, company)) or []
    guidance = extract_guidance(db, user_id, company) if company else []
    earnings = step("Earnings Intelligence Agent", lambda: analyze_earnings(db, company)) if include_earnings and company else None
    earnings_topics = topic_map(db, company) if include_earnings and company else []
    events = step("Event Intelligence Agent", lambda: {"signal": event_signal(db, company), "events": list_news(db, company=company, limit=8)}) if include_news and company else None

    forecast = scenarios = anomalies = None
    series_meta = None
    if include_forecast and company:
        series_meta = next((v for k, v in _series_map().items() if company.lower() in k.lower() or k.lower() in company.lower()), None)
        if series_meta:
            forecast = step("Forecast Agent", lambda: forecast_series(db, series_meta["series_name"], horizon))
            if forecast:
                def _scenario_from_base():
                    return {
                        "series_name": forecast["series_name"],
                        "selected_model": forecast["selected_model"],
                        "adjustments": {"bull_pct": 6.0, "bear_pct": 6.0},
                        "scenarios": [
                            {"period": r["period"], "bear": round(r["value"] * 0.94, 2), "base": r["value"], "bull": round(r["value"] * 1.06, 2), "statistical_lower_95": r["lower_95"], "statistical_upper_95": r["upper_95"]}
                            for r in forecast["forecast"]
                        ],
                        "note": "Bull/bear values are sensitivity scenarios built from the selected base forecast.",
                    }
                scenarios = step("Scenario Agent", _scenario_from_base)
            anomalies = step("Anomaly Detection Agent", lambda: detect_anomalies(db, series_meta["series_name"]))

    generated = step("Research Synthesis Agent", lambda: generator.generate(question, retrieval)) or {"answer": "No grounded answer could be generated.", "grounded": False, "backend": "none", "citation_validation": {"valid": False}}
    coverage_components = [bool(retrieval), bool(kpis and kpis.get("kpis")), bool(risks), bool(company_sentiment), bool(graph and graph.get("nodes")), bool(forecast)]
    coverage = sum(coverage_components) / max(1, len(coverage_components))
    source_quality = sum(min(1.0, float(s.get("score", 0))) for s in retrieval) / max(1, len(retrieval))
    citation_valid = bool(generated.get("citation_validation", {}).get("valid", False))
    source_diversity = min(1.0, len({s.get("document") for s in retrieval}) / 3.0)
    confidence = round(min(0.97, 0.30 + 0.25 * coverage + 0.20 * source_quality + 0.10 * source_diversity + (0.12 if citation_valid else 0)), 3)
    verification = {
        "grounded": bool(generated.get("grounded")),
        "citation_validation": generated.get("citation_validation"),
        "evidence_coverage": round(coverage, 3),
        "average_source_score": round(source_quality, 3),
        "prompt_injection_detected": guard["prompt_injection_detected"],
        "investment_advice_intent": guard["investment_advice_intent"],
        "disclaimer": research_disclaimer(),
    }
    trace.append({"agent": "Verification Agent", "status": "completed" if citation_valid else "degraded", "duration_ms": 0.0, "error": None if citation_valid else "Citation validation did not fully pass"})

    risk_items = [r for doc in risks for r in doc.get("risks", [])][:8]
    guidance_items = [g for doc in guidance for g in doc.get("guidance", [])][:8]
    forecast_section = None
    if forecast:
        forecast_section = {
            "series": forecast["series_name"],
            "selected_model": forecast["selected_model"],
            "top_models": forecast.get("model_leaderboard", [])[:5],
            "forecast": forecast["forecast"],
            "scenarios": scenarios.get("scenarios", []) if scenarios else [],
            "anomalies": anomalies.get("anomaly_count", 0) if anomalies else None,
        }
    sections = {
        "fundamentals": {
            "text_extracted_kpis": kpis.get("kpis", {}) if kpis else {},
            "structured_facts": xbrl.get("facts", [])[:12] if xbrl else [],
            "derived_ratios": ratios,
            "document_sentiment": company_sentiment,
        },
        "risks_and_guidance": {"risks": risk_items, "guidance": guidance_items},
        "earnings_intelligence": earnings.get("summary") if earnings else None,
        "earnings_topics": earnings_topics,
        "event_intelligence": events,
        "forecast_and_scenarios": forecast_section,
        "graph_reasoning": {
            "nodes": graph.get("nodes", [])[:12] if graph else [],
            "edges": graph.get("edges", [])[:18] if graph else [],
            "evidence": graph.get("evidence", [])[:8] if graph else [],
        },
    }
    return {
        "workflow_version": "4.0",
        "company": company,
        "question": question,
        "plan": plan,
        "trace": trace,
        "executive_summary": generated.get("answer", ""),
        "retrieval_mode": "graph_hybrid",
        "generator_backend": generated.get("backend"),
        "confidence": confidence,
        "sources": retrieval,
        "sections": sections,
        "verification": verification,
        "total_duration_ms": round((time.perf_counter() - workflow_started) * 1000, 2),
        "next_questions": [
            f"What changed in {company}'s guidance?" if company else "What changed in management guidance?",
            f"What are the top risks for {company}?" if company else "What are the top risks?",
            f"Compare {company} with a peer using financial and risk signals." if company else "Compare two companies using financial and risk signals.",
        ],
    }
