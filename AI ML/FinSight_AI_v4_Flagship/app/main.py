from __future__ import annotations
import csv
import hashlib
import json
import logging
import time
import uuid
from pathlib import Path
from fastapi import Depends, FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, Response
from prometheus_client import CONTENT_TYPE_LATEST, Counter, Histogram, generate_latest
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .config import BASE_DIR, get_settings
from .database import Base, SessionLocal, engine, get_db
from .models import (
    AlertRule, Chunk, Document, FinancialPoint, Membership, PortfolioPosition, ResearchAudit,
    ResearchReport, User, Watchlist, WatchlistItem, Workspace,
)
from .schemas import (
    AgentResearchRequest, AlertRuleRequest, CompareCompaniesRequest, FinancialSeriesInput,
    GraphQueryRequest, LoginRequest, NewsEventInput, PortfolioPositionRequest, QueryRequest,
    RegisterRequest, ReportGenerateRequest, ScenarioRequest, SECIngestRequest, WatchlistCreateRequest,
    WatchlistItemRequest, XBRLRequest,
)
from .security import create_access_token, current_user, hash_password, verify_password
from .services.agent_workflow import run_research_workflow
from .services.anomalies import detect_anomalies
from .services.cache import cache
from .services.company_intel import compare_companies
from .services.documents import ALLOWED_EXTENSIONS, ingest_document, seed_documents
from .services.earnings import analyze_earnings, seed_earnings, topic_map
from .services.embeddings import embedder_status, ensure_embeddings
from .services.evaluation import evaluate_retrieval
from .services.evaluation_advanced import evaluate_system
from .services.feature_registry import feature_matrix
from .services.forecasting import forecast_series, replace_series, scenario_forecast
from .services.generator import generator
from .services.graph_rag import graph_status, query_graph, rebuild_graph, shortest_relationship
from .services.guardrails import inspect_question, research_disclaimer
from .services.guidance import extract_guidance
from .services.kpi import extract_kpis
from .services.multimodal import inspect_document_bytes
from .services.news import add_news_event, event_signal, list_news, seed_news
from .services.pgvector_store import ensure_pgvector_schema, status as pgvector_status, sync_chunk_vectors
from .services.portfolio import portfolio_summary, upsert_position
from .services.reporting import persist_report
from .services.retrieval import retriever
from .services.risks import risk_analysis
from .services.sec_ingest import fetch_latest_filing
from .services.sentiment import sentiment_by_document
from .services.telemetry import setup_telemetry
from .services.xbrl import get_company_facts, ratio_summary

settings = get_settings()
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("finsight")
REQUESTS = Counter("finsight_http_requests_total", "HTTP requests", ["method", "path", "status"])
LATENCY = Histogram("finsight_http_request_duration_seconds", "HTTP request latency", ["path"])
RESEARCH = Counter("finsight_research_queries_total", "Research queries", ["mode", "generator"])
AGENT_RUNS = Counter("finsight_agent_runs_total", "Agentic research runs", ["status"])


def _workspace_for(db: Session, user_id: int) -> Workspace | None:
    membership = db.scalar(select(Membership).where(Membership.user_id == user_id).order_by(Membership.id))
    return db.get(Workspace, membership.workspace_id) if membership else None


def _seed_company_series(db: Session) -> None:
    data = json.loads((BASE_DIR / "data" / "company_series.json").read_text())
    for company, cfg in data.items():
        exists = db.scalar(select(FinancialPoint.id).where(FinancialPoint.series_name == cfg["series_name"]).limit(1))
        if not exists:
            replace_series(db, cfg["series_name"], [(p[0], float(p[1])) for p in cfg["points"]], company=company, metric=cfg.get("metric"))


def _seed_user_assets(db: Session, user: User) -> None:
    workspace = db.scalar(select(Workspace).where(Workspace.owner_id == user.id))
    if not workspace:
        workspace = Workspace(name="FinSight Research Workspace", owner_id=user.id)
        db.add(workspace); db.flush()
        db.add(Membership(workspace_id=workspace.id, user_id=user.id, role="admin"))
    watchlist = db.scalar(select(Watchlist).where(Watchlist.user_id == user.id))
    if not watchlist:
        watchlist = Watchlist(user_id=user.id, name="Flagship Demo Watchlist")
        db.add(watchlist); db.flush()
        for ticker, company in [("ASTR", "Aster Systems"), ("MREN", "Meridian Energy"), ("NSTR", "Northstar Retail")]:
            db.add(WatchlistItem(watchlist_id=watchlist.id, ticker=ticker, company=company))
    if not db.scalar(select(PortfolioPosition.id).where(PortfolioPosition.user_id == user.id).limit(1)):
        for ticker, company, shares, cost, price in [
            ("ASTR", "Aster Systems", 18, 68, 82), ("MREN", "Meridian Energy", 24, 51, 57), ("NSTR", "Northstar Retail", 12, 92, 88),
        ]:
            db.add(PortfolioPosition(user_id=user.id, ticker=ticker, company=company, shares=shares, cost_basis=cost, current_price=price))
    if not db.scalar(select(AlertRule.id).where(AlertRule.user_id == user.id).limit(1)):
        db.add(AlertRule(user_id=user.id, ticker="ASTR", event_type="any", threshold=0.65, enabled=True))
        db.add(AlertRule(user_id=user.id, ticker="MREN", event_type="regulatory", threshold=0.65, enabled=True))
    db.commit()


def seed_database() -> None:
    (BASE_DIR / "runtime").mkdir(parents=True, exist_ok=True)
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        ensure_pgvector_schema(db)
        user = db.scalar(select(User).where(User.email == settings.demo_email))
        if not user:
            user = User(email=settings.demo_email, password_hash=hash_password(settings.demo_password), display_name="Demo Analyst")
            db.add(user); db.commit(); db.refresh(user)
        _seed_user_assets(db, user)
        seed_documents(db, BASE_DIR / "data")
        chunks = list(db.scalars(select(Chunk).order_by(Chunk.id)).all())
        ensure_embeddings(db, chunks)
        sync_chunk_vectors(db, chunks)
        if not db.scalar(select(func.count(FinancialPoint.id))):
            with open(BASE_DIR / "data" / "revenue_history.csv", newline="") as f:
                rows = list(csv.DictReader(f))
            replace_series(db, "revenue_m", [(r["quarter"], float(r["revenue_m"])) for r in rows], company="Portfolio Demo", metric="revenue_m")
        _seed_company_series(db)
        seed_earnings(db)
        seed_news(db)
        if not graph_status(db)["active"]:
            rebuild_graph(db)
    finally:
        db.close()


seed_database()
app = FastAPI(
    title="FinSight AI",
    version="4.0.0",
    description="Agentic financial intelligence platform with GraphRAG, multimodal document analysis, SEC/XBRL ingestion, earnings/news intelligence, multi-model forecasting, reports, evaluation and production observability.",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
TELEMETRY_STATUS = setup_telemetry(app)


@app.middleware("http")
async def request_middleware(request: Request, call_next):
    request_id = request.headers.get("x-request-id") or str(uuid.uuid4())
    key = request.client.host if request.client else "unknown"
    if not cache.allow_request(key, settings.rate_limit_per_minute):
        return JSONResponse({"detail": "Rate limit exceeded", "request_id": request_id}, status_code=429)
    start = time.perf_counter()
    try:
        response = await call_next(request)
    except Exception:
        logger.exception("request_failed request_id=%s path=%s", request_id, request.url.path)
        return JSONResponse({"detail": "Internal server error", "request_id": request_id}, status_code=500)
    duration = time.perf_counter() - start
    response.headers["x-request-id"] = request_id
    REQUESTS.labels(request.method, request.url.path, response.status_code).inc()
    LATENCY.labels(request.url.path).observe(duration)
    logger.info("request_id=%s method=%s path=%s status=%s duration_ms=%.1f", request_id, request.method, request.url.path, response.status_code, duration * 1000)
    return response


@app.get("/")
def home():
    return FileResponse(BASE_DIR / "static" / "index.html")


@app.get("/api/v1/health/live")
def live():
    return {"status": "ok", "service": "finsight", "version": "4.0.0"}


@app.get("/api/v1/health/ready")
def ready(db: Session = Depends(get_db)):
    db.execute(select(1))
    issues = []
    if settings.app_env.lower() == "production" and settings.secret_key.startswith("development-only-secret"):
        issues.append("SECRET_KEY must be changed in production")
    vector = pgvector_status(db)
    if settings.is_postgres and not vector.get("active"):
        issues.append("pgvector extension/index is not active")
    return {
        "ready": not issues,
        "issues": issues,
        "documents": db.scalar(select(func.count(Document.id))) or 0,
        "cache_backend": cache.backend,
        "pgvector": vector,
        "graph": graph_status(db),
        "features": feature_matrix()["total"],
    }


@app.get("/api/v1/system/capabilities")
def capabilities(db: Session = Depends(get_db)):
    matrix = feature_matrix()
    return {
        "version": "4.0.0",
        "platform": "FinSight AI Flagship",
        "retrieval": retriever.status(),
        "embeddings": embedder_status(),
        "pgvector": pgvector_status(db),
        "graph": graph_status(db),
        "generator": generator.status(),
        "cache_backend": cache.backend,
        "telemetry": TELEMETRY_STATUS,
        "feature_count": matrix["total"],
        "feature_matrix": matrix,
        "main_workflow": ["Research Planner", "Evidence Retrieval", "Graph Reasoning", "Fundamentals/XBRL", "Risk & Guidance", "Earnings", "Events", "Forecast & Anomaly", "Citation Verification", "Research Synthesis"],
    }


@app.get("/api/v1/system/features")
def system_features():
    return feature_matrix()


@app.get("/metrics")
def metrics():
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)


@app.post("/api/v1/auth/register")
def register(payload: RegisterRequest, db: Session = Depends(get_db)):
    user = User(email=payload.email.lower(), password_hash=hash_password(payload.password))
    db.add(user)
    try:
        db.commit(); db.refresh(user)
    except IntegrityError:
        db.rollback(); raise HTTPException(409, "Email already registered")
    _seed_user_assets(db, user)
    return {"access_token": create_access_token(user.id, user.email), "token_type": "bearer"}


@app.post("/api/v1/auth/login")
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.email == payload.email.lower()))
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(401, "Invalid email or password")
    return {"access_token": create_access_token(user.id, user.email), "token_type": "bearer"}


@app.get("/api/v1/auth/me")
def me(db: Session = Depends(get_db), user: User = Depends(current_user)):
    workspace = _workspace_for(db, user.id)
    membership = db.scalar(select(Membership).where(Membership.user_id == user.id, Membership.workspace_id == workspace.id)) if workspace else None
    return {"id": user.id, "email": user.email, "display_name": user.display_name, "workspace": {"id": workspace.id, "name": workspace.name, "role": membership.role} if workspace else None, "created_at": user.created_at}


@app.get("/api/v1/workspaces")
def workspaces(db: Session = Depends(get_db), user: User = Depends(current_user)):
    rows = db.execute(select(Membership, Workspace).join(Workspace, Workspace.id == Membership.workspace_id).where(Membership.user_id == user.id)).all()
    return [{"id": r.Workspace.id, "name": r.Workspace.name, "role": r.Membership.role, "created_at": r.Workspace.created_at} for r in rows]


@app.get("/api/v1/documents")
def list_documents(db: Session = Depends(get_db), user: User = Depends(current_user)):
    docs = db.scalars(select(Document).where(or_(Document.uploaded_by.is_(None), Document.uploaded_by == user.id)).order_by(Document.created_at.desc())).all()
    return [{
        "id": d.id, "filename": d.filename, "company": d.company, "document_type": d.document_type,
        "storage_uri": d.storage_uri, "source_url": d.source_url, "source_date": d.source_date, "created_at": d.created_at,
    } for d in docs]


@app.post("/api/v1/documents/upload")
async def upload_document(
    file: UploadFile = File(...), company: str | None = Form(default=None), document_type: str = Form(default="research_brief"),
    db: Session = Depends(get_db), user: User = Depends(current_user),
):
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in ALLOWED_EXTENSIONS:
        raise HTTPException(415, "Only TXT, MD and PDF files are supported")
    raw = await file.read(settings.max_upload_mb * 1024 * 1024 + 1)
    if len(raw) > settings.max_upload_mb * 1024 * 1024:
        raise HTTPException(413, f"Maximum upload size is {settings.max_upload_mb} MB")
    workspace = _workspace_for(db, user.id)
    try:
        doc = ingest_document(db, file.filename or "upload.txt", raw, user.id, company, document_type, workspace_id=workspace.id if workspace else None)
        rebuild_graph(db, user.id)
    except ValueError as exc:
        raise HTTPException(422, str(exc))
    return {"id": doc.id, "filename": doc.filename, "company": doc.company, "storage_uri": doc.storage_uri, "multimodal_ready": True}


@app.post("/api/v1/documents/inspect")
async def inspect_document(file: UploadFile = File(...), user: User = Depends(current_user)):
    raw = await file.read(settings.max_upload_mb * 1024 * 1024 + 1)
    if len(raw) > settings.max_upload_mb * 1024 * 1024:
        raise HTTPException(413, f"Maximum upload size is {settings.max_upload_mb} MB")
    try:
        return inspect_document_bytes(file.filename or "document.pdf", raw)
    except ValueError as exc:
        raise HTTPException(422, str(exc))


@app.post("/api/v1/documents/reindex")
def reindex_documents(db: Session = Depends(get_db), user: User = Depends(current_user)):
    chunks = list(db.scalars(select(Chunk)).all())
    embedded = ensure_embeddings(db, chunks, force=True)
    synced = sync_chunk_vectors(db, chunks)
    graph = rebuild_graph(db, user.id)
    return {"chunks": len(chunks), "embeddings_refreshed": embedded, "pgvector_synced": synced, "graph": graph, "embedding": embedder_status()}


@app.delete("/api/v1/documents/{document_id}")
def delete_document(document_id: int, db: Session = Depends(get_db), user: User = Depends(current_user)):
    doc = db.get(Document, document_id)
    if not doc: raise HTTPException(404, "Document not found")
    if doc.uploaded_by is None: raise HTTPException(403, "Seed documents are read-only")
    if doc.uploaded_by != user.id: raise HTTPException(403, "You can only delete your own documents")
    db.delete(doc); db.commit(); rebuild_graph(db, user.id)
    return {"deleted": document_id}


@app.post("/api/v1/ingest/sec")
def ingest_sec(payload: SECIngestRequest, db: Session = Depends(get_db), user: User = Depends(current_user)):
    try:
        filing = fetch_latest_filing(payload.ticker, payload.form_type)
        workspace = _workspace_for(db, user.id)
        doc = ingest_document(db, filing["filename"], filing["text"].encode("utf-8"), user.id, company=filing["company"], document_type=payload.form_type, workspace_id=workspace.id if workspace else None, source_url=filing.get("source_url"), source_date=filing.get("filing_date"))
        rebuild_graph(db, user.id)
        return {"document_id": doc.id, **{k: v for k, v in filing.items() if k != "text"}}
    except (ValueError, RuntimeError) as exc:
        raise HTTPException(422, str(exc))
    except Exception as exc:
        raise HTTPException(503, f"SEC ingestion unavailable: {type(exc).__name__}")


@app.post("/api/v1/ingest/xbrl")
def ingest_xbrl(payload: XBRLRequest, user: User = Depends(current_user)):
    try:
        data = get_company_facts(payload.ticker, live=payload.live)
        data["ratios"] = ratio_summary(data)
        return data
    except ValueError as exc:
        raise HTTPException(422, str(exc))
    except Exception as exc:
        raise HTTPException(503, f"XBRL source unavailable: {type(exc).__name__}")


@app.post("/api/v1/research/query")
def research(payload: QueryRequest, db: Session = Depends(get_db), user: User = Depends(current_user)):
    guard = inspect_question(payload.question)
    if guard["prompt_injection_detected"]:
        raise HTTPException(422, "Potential prompt-injection instruction detected. Rephrase as a financial research question.")
    key_raw = f"{user.id}|{payload.mode}|{payload.top_k}|{payload.company}|{payload.min_score}|{payload.question}"
    cache_key = "research:" + hashlib.sha256(key_raw.encode()).hexdigest()
    cached = cache.get_json(cache_key)
    if cached is not None:
        cached["cache_hit"] = True; return cached
    started = time.perf_counter()
    sources = retriever.search(db, payload.question, payload.top_k, payload.company, payload.min_score, user.id, mode=payload.mode)
    result = generator.generate(payload.question, sources)
    latency_ms = round((time.perf_counter() - started) * 1000, 2)
    response = {
        "question": payload.question, **result, "retrieval_mode": payload.mode, "retrieval": retriever.status(), "cache_hit": False,
        "guardrails": guard, "disclaimer": research_disclaimer(), "latency_ms": latency_ms,
        "sources": [{**s, "citation": f"S{i}"} for i, s in enumerate(sources, 1)],
    }
    db.add(ResearchAudit(user_id=user.id, question=payload.question, retrieval_mode=payload.mode, generator_backend=result.get("backend", "unknown")[:64], top_score=sources[0]["score"] if sources else 0.0, source_count=len(sources), latency_ms=latency_ms))
    db.commit(); RESEARCH.labels(payload.mode, result.get("backend", "unknown")[:40]).inc(); cache.set_json(cache_key, response, ttl=90)
    return response


@app.post("/api/v1/agents/research")
def agent_research(payload: AgentResearchRequest, db: Session = Depends(get_db), user: User = Depends(current_user)):
    try:
        result = run_research_workflow(db, user.id, payload.question, payload.company, payload.horizon, payload.include_news, payload.include_earnings, payload.include_forecast, payload.include_graph)
        AGENT_RUNS.labels("completed").inc(); return result
    except ValueError as exc:
        AGENT_RUNS.labels("rejected").inc(); raise HTTPException(422, str(exc))


@app.get("/api/v1/graph/status")
def get_graph_status(db: Session = Depends(get_db), user: User = Depends(current_user)):
    return graph_status(db)


@app.post("/api/v1/graph/rebuild")
def graph_rebuild(db: Session = Depends(get_db), user: User = Depends(current_user)):
    return rebuild_graph(db, user.id)


@app.post("/api/v1/graph/query")
def graph_query(payload: GraphQueryRequest, db: Session = Depends(get_db), user: User = Depends(current_user)):
    return query_graph(db, payload.question, payload.company, payload.max_nodes)


@app.get("/api/v1/graph/path")
def graph_path(source: str, target: str, db: Session = Depends(get_db), user: User = Depends(current_user)):
    return shortest_relationship(db, source, target)


@app.get("/api/v1/analytics/sentiment")
def sentiment(company: str | None = None, db: Session = Depends(get_db), user: User = Depends(current_user)):
    rows = sentiment_by_document(db, user.id)
    if company: rows = [x for x in rows if company.lower() in x["company"].lower()]
    return {"documents": rows, "active_backend": rows[0]["backend"] if rows else "none", "method_note": "FinBERT is optional; offline fallback is a transparent financial-domain lexicon. Not a trading signal."}


@app.get("/api/v1/analytics/kpis")
def kpis(company: str | None = None, db: Session = Depends(get_db), user: User = Depends(current_user)):
    return {"documents": extract_kpis(db, user.id, company), "company_filter": company}


@app.get("/api/v1/analytics/risks")
def risks(company: str | None = None, db: Session = Depends(get_db), user: User = Depends(current_user)):
    return {"documents": risk_analysis(db, user.id, company), "company_filter": company}


@app.get("/api/v1/analytics/guidance")
def guidance(company: str | None = None, db: Session = Depends(get_db), user: User = Depends(current_user)):
    return {"documents": extract_guidance(db, user.id, company), "company_filter": company}


@app.post("/api/v1/analytics/compare")
def company_comparison(payload: CompareCompaniesRequest, db: Session = Depends(get_db), user: User = Depends(current_user)):
    cleaned = [x.strip() for x in payload.companies if x.strip()]
    if len(cleaned) < 2: raise HTTPException(422, "At least two company names are required")
    return compare_companies(db, user.id, cleaned)


@app.get("/api/v1/analytics/anomalies/{series_name}")
def anomalies(series_name: str, db: Session = Depends(get_db), user: User = Depends(current_user)):
    try: return detect_anomalies(db, series_name)
    except ValueError as exc: raise HTTPException(422, str(exc))


@app.get("/api/v1/analytics/earnings")
def earnings(company: str | None = None, period: str | None = None, db: Session = Depends(get_db), user: User = Depends(current_user)):
    return {"analysis": analyze_earnings(db, company, period), "topics": topic_map(db, company)}


@app.get("/api/v1/analytics/news")
def news(company: str | None = None, ticker: str | None = None, db: Session = Depends(get_db), user: User = Depends(current_user)):
    return {"events": list_news(db, company, ticker, 40), "signal": event_signal(db, company) if company else None}


@app.post("/api/v1/analytics/news")
def create_news(payload: NewsEventInput, db: Session = Depends(get_db), user: User = Depends(current_user)):
    row = add_news_event(db, payload.company, payload.headline, payload.ticker, payload.source, payload.source_url)
    return {"id": row.id, "event_type": row.event_type, "sentiment": row.sentiment, "impact_score": row.impact_score}


@app.get("/api/v1/forecast/{series_name}")
def forecast(series_name: str, horizon: int = 4, db: Session = Depends(get_db), user: User = Depends(current_user)):
    if horizon < 1 or horizon > 12: raise HTTPException(422, "horizon must be between 1 and 12")
    try: return forecast_series(db, series_name, horizon)
    except ValueError as exc: raise HTTPException(422, str(exc))


@app.put("/api/v1/forecast/{series_name}")
def update_series(series_name: str, payload: FinancialSeriesInput, db: Session = Depends(get_db), user: User = Depends(current_user)):
    replace_series(db, series_name[:120], [(p.period, p.value) for p in payload.points])
    return {"series_name": series_name, "points": len(payload.points)}


@app.post("/api/v1/forecast/scenarios")
def scenarios(payload: ScenarioRequest, db: Session = Depends(get_db), user: User = Depends(current_user)):
    try: return scenario_forecast(db, payload.series_name, payload.horizon, payload.bull_adjustment_pct, payload.bear_adjustment_pct)
    except ValueError as exc: raise HTTPException(422, str(exc))


@app.get("/api/v1/watchlists")
def get_watchlists(db: Session = Depends(get_db), user: User = Depends(current_user)):
    lists = db.scalars(select(Watchlist).where(Watchlist.user_id == user.id).order_by(Watchlist.created_at)).all()
    out = []
    for w in lists:
        items = db.scalars(select(WatchlistItem).where(WatchlistItem.watchlist_id == w.id).order_by(WatchlistItem.ticker)).all()
        out.append({"id": w.id, "name": w.name, "items": [{"id": i.id, "ticker": i.ticker, "company": i.company} for i in items]})
    return out


@app.post("/api/v1/watchlists")
def create_watchlist(payload: WatchlistCreateRequest, db: Session = Depends(get_db), user: User = Depends(current_user)):
    row = Watchlist(user_id=user.id, name=payload.name); db.add(row); db.commit(); db.refresh(row); return {"id": row.id, "name": row.name}


@app.post("/api/v1/watchlists/{watchlist_id}/items")
def add_watchlist_item(watchlist_id: int, payload: WatchlistItemRequest, db: Session = Depends(get_db), user: User = Depends(current_user)):
    watchlist = db.scalar(select(Watchlist).where(Watchlist.id == watchlist_id, Watchlist.user_id == user.id))
    if not watchlist: raise HTTPException(404, "Watchlist not found")
    row = WatchlistItem(watchlist_id=watchlist.id, ticker=payload.ticker.upper(), company=payload.company)
    db.add(row)
    try: db.commit(); db.refresh(row)
    except IntegrityError: db.rollback(); raise HTTPException(409, "Ticker already exists in watchlist")
    return {"id": row.id, "ticker": row.ticker, "company": row.company}


@app.get("/api/v1/alerts")
def alerts(db: Session = Depends(get_db), user: User = Depends(current_user)):
    rows = db.scalars(select(AlertRule).where(AlertRule.user_id == user.id).order_by(AlertRule.id)).all()
    return [{"id": r.id, "ticker": r.ticker, "event_type": r.event_type, "threshold": r.threshold, "enabled": r.enabled} for r in rows]


@app.post("/api/v1/alerts")
def create_alert(payload: AlertRuleRequest, db: Session = Depends(get_db), user: User = Depends(current_user)):
    row = AlertRule(user_id=user.id, ticker=payload.ticker.upper(), event_type=payload.event_type, threshold=payload.threshold, enabled=payload.enabled)
    db.add(row); db.commit(); db.refresh(row); return {"id": row.id}


@app.get("/api/v1/alerts/evaluate")
def evaluate_alerts(db: Session = Depends(get_db), user: User = Depends(current_user)):
    rules = db.scalars(select(AlertRule).where(AlertRule.user_id == user.id, AlertRule.enabled.is_(True))).all()
    matches = []
    for r in rules:
        events = list_news(db, ticker=r.ticker, limit=20)
        for e in events:
            type_ok = r.event_type == "any" or e["event_type"] == r.event_type
            if type_ok and e["impact_score"] >= r.threshold:
                matches.append({"rule_id": r.id, "ticker": r.ticker, "event": e})
    return {"rules_checked": len(rules), "matches": matches}


@app.get("/api/v1/portfolio")
def portfolio(db: Session = Depends(get_db), user: User = Depends(current_user)):
    return portfolio_summary(db, user.id)


@app.put("/api/v1/portfolio/positions")
def portfolio_position(payload: PortfolioPositionRequest, db: Session = Depends(get_db), user: User = Depends(current_user)):
    row = upsert_position(db, user.id, payload.ticker, payload.company, payload.shares, payload.cost_basis, payload.current_price)
    return {"id": row.id, "ticker": row.ticker}


@app.post("/api/v1/reports/generate")
def generate_report(payload: ReportGenerateRequest, db: Session = Depends(get_db), user: User = Depends(current_user)):
    try:
        research_payload = run_research_workflow(db, user.id, payload.question, payload.company, payload.horizon, True, True, True, True)
        row = persist_report(db, user.id, research_payload, export_pdf=payload.export_pdf)
        return {"id": row.id, "title": row.title, "company": row.company, "markdown_path": row.markdown_path, "pdf_path": row.pdf_path, "confidence": research_payload.get("confidence")}
    except ValueError as exc:
        raise HTTPException(422, str(exc))


@app.get("/api/v1/reports")
def reports(db: Session = Depends(get_db), user: User = Depends(current_user)):
    rows = db.scalars(select(ResearchReport).where(ResearchReport.user_id == user.id).order_by(ResearchReport.created_at.desc()).limit(30)).all()
    return [{"id": r.id, "title": r.title, "company": r.company, "created_at": r.created_at, "has_pdf": bool(r.pdf_path)} for r in rows]


@app.get("/api/v1/reports/{report_id}/download")
def download_report(report_id: int, format: str = "pdf", db: Session = Depends(get_db), user: User = Depends(current_user)):
    row = db.scalar(select(ResearchReport).where(ResearchReport.id == report_id, ResearchReport.user_id == user.id))
    if not row: raise HTTPException(404, "Report not found")
    path = Path(row.pdf_path if format == "pdf" else row.markdown_path or "")
    if not path.exists(): raise HTTPException(404, "Report file not available")
    return FileResponse(path, filename=path.name, media_type="application/pdf" if path.suffix == ".pdf" else "text/markdown")


@app.get("/api/v1/evaluation/retrieval")
def retrieval_evaluation(db: Session = Depends(get_db), user: User = Depends(current_user)):
    return evaluate_retrieval(db, BASE_DIR / "data" / "evaluation_queries.json", user.id)


@app.get("/api/v1/evaluation/advanced")
def advanced_evaluation(db: Session = Depends(get_db), user: User = Depends(current_user)):
    return evaluate_system(db, BASE_DIR / "data" / "evaluation_queries.json", user.id)


@app.get("/api/v1/audit/recent")
def recent_audit(db: Session = Depends(get_db), user: User = Depends(current_user)):
    rows = db.scalars(select(ResearchAudit).where(ResearchAudit.user_id == user.id).order_by(ResearchAudit.created_at.desc()).limit(30)).all()
    return [{"question": r.question, "retrieval_mode": r.retrieval_mode, "generator_backend": r.generator_backend, "top_score": r.top_score, "source_count": r.source_count, "latency_ms": r.latency_ms, "created_at": r.created_at} for r in rows]
