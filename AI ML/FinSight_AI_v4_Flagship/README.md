# FinSight AI v4 - Agentic Financial Intelligence Platform

FinSight AI is a full-stack AI/ML portfolio project for evidence-grounded financial research. It combines hybrid RAG, a persisted financial knowledge graph, SEC/XBRL adapters, earnings-call intelligence, event signals, KPI/risk/guidance extraction, multi-model forecasting, anomaly detection, portfolio/watchlist tooling, report export, evaluation, security controls and production observability.

The bundled demo is deliberately runnable without paid APIs. Production adapters are included for pgvector, Redis, S3-compatible storage, SentenceTransformers, cross-encoder reranking, FinBERT, SEC endpoints, Ollama/chat-completions-compatible generation and OpenTelemetry.

> Research assistance only. The application is not investment, legal, tax or accounting advice.

## Main interviewer demo

1. Log in to the research workspace.
2. Click **Run Flagship Demo**.
3. The Research Planner decomposes the task.
4. The Evidence Agent runs BM25 + dense retrieval + GraphRAG + reranking.
5. Fundamentals are enriched with structured XBRL facts and text-extracted KPIs.
6. Risk/Guidance, Earnings and Event agents contribute independent signals.
7. Forecasting compares statistical and ML models with rolling backtests.
8. Anomaly/scenario analysis is added.
9. The Synthesis Agent builds a citation-backed answer.
10. The Verification Agent checks citation validity, evidence coverage and guardrails.
11. Generate a PDF/Markdown research report from the same workflow.

## One-command local run

```bash
./run.sh
```

Open: `http://localhost:8000`

Demo login:

```text
Email: demo@finsight.ai
Password: DemoPass123!
```

API documentation: `http://localhost:8000/docs`
Prometheus metrics: `http://localhost:8000/metrics`

For the heavyweight optional ML/NLP adapters (SentenceTransformers, cross-encoder, FinBERT, XGBoost/LightGBM and OCR dependencies), use:

```bash
./run_advanced.sh
```

The standard `run.sh` intentionally stays lightweight so the full interview workflow can run on a normal laptop without downloading large neural models.

## Tests

```bash
pytest -q
```

The package is shipped with 19 automated tests covering authentication, workspaces, hybrid/graph retrieval, citation grounding, advanced evaluation, KPI/risk/guidance extraction, earnings, XBRL, GraphRAG, agentic research, forecasting, multimodal inspection, watchlists, alerts, portfolio analytics, report generation, prompt-injection protection and reindexing.

## CLI demo

Start the server, then:

```bash
python scripts/demo_api.py
```

This writes `DEMO_OUTPUT.json` and prints the end-to-end agent trace.

The `demo/` folder also contains captured dashboard screenshots, the measured demo JSON/CLI trace and a sample exported research PDF/Markdown report.

On the bundled 12-question evaluation set, the latest captured demo selects `graph_hybrid` retrieval with MRR/NDCG@5 of `1.0`. The same controlled run reports citation precision/recall of `1.0`. These are small demo-set measurements, not external production benchmarks; the output file records the exact run.

## Architecture

```text
Browser SPA
   |
FastAPI API
   |
   +--> Auth / Workspace / Audit
   +--> Document ingestion --> PDF/Tables/OCR adapter --> Chunking --> Embeddings
   |                                               |                    |
   |                                               +--> S3 adapter       +--> pgvector/HNSW
   |
   +--> Research Planner
           |
           +--> Sparse BM25 Retrieval ---------+
           +--> Dense Vector Retrieval --------+--> Fusion --> Reranker
           +--> Financial Knowledge Graph -----+                 |
                                                               Evidence
                                                                  |
       +-------------------+----------------+---------------------+------------------+
       |                   |                |                     |                  |
   Fundamentals         Risks/Guidance   Earnings             Events           Forecasting
   XBRL + KPI           extraction       intelligence         signals          ARIMA/Holt/ML
       |                   |                |                     |                  |
       +-------------------+----------------+---------------------+------------------+
                                                                  |
                                                        Grounded Synthesis
                                                                  |
                                                        Citation Verification
                                                                  |
                                                        Research Report / UI
```

See `ARCHITECTURE.md` for the detailed design.

## 50+ capability matrix

The API exposes `/api/v1/system/features`. Key areas include:

- JWT auth, scrypt password hashing, workspace/RBAC data model and audit history.
- PDF/TXT/MD ingestion, SHA-256 deduplication, table extraction, chart-reference detection and optional OCR.
- SEC 10-K/10-Q/8-K and XBRL/companyfacts adapters.
- BM25, dense embeddings, hybrid retrieval, pgvector/HNSW, reranking and GraphRAG.
- Grounded generation, citation verification and prompt-injection detection.
- Financial sentiment, optional FinBERT, KPI/ratio/risk/guidance extraction.
- Earnings-call intelligence, news/event classification and company comparison.
- Naive/moving-average/drift/linear/Holt/ARIMA/Gradient Boosting/Random Forest/XGBoost/LightGBM/ensemble forecasting.
- Rolling backtests, MAE/RMSE/MAPE, bull/base/bear scenarios and anomaly detection.
- Watchlists, event alerts, portfolio P&L/concentration analytics and research report export.
- Recall@K, Precision@K, MRR, NDCG, citation precision/recall and faithfulness proxy evaluation.
- Redis/memory caching, rate limiting, Prometheus, optional OpenTelemetry, Docker/Compose and CI.

`FEATURE_MATRIX.md` explains which features work fully offline and which require external infrastructure/models.

## Core API routes

| Area | Route |
|---|---|
| Login | `POST /api/v1/auth/login` |
| Documents | `GET/POST /api/v1/documents` |
| Multimodal inspect | `POST /api/v1/documents/inspect` |
| SEC filing | `POST /api/v1/ingest/sec` |
| XBRL facts | `POST /api/v1/ingest/xbrl` |
| Direct RAG | `POST /api/v1/research/query` |
| Full agent workflow | `POST /api/v1/agents/research` |
| GraphRAG | `POST /api/v1/graph/query` |
| KPI / risk / guidance | `/api/v1/analytics/*` |
| Earnings intelligence | `GET /api/v1/analytics/earnings` |
| News/events | `GET/POST /api/v1/analytics/news` |
| Forecasting | `GET /api/v1/forecast/{series}` |
| Scenarios | `POST /api/v1/forecast/scenarios` |
| Portfolio | `GET /api/v1/portfolio` |
| Watchlists | `GET/POST /api/v1/watchlists` |
| Alerts | `GET/POST /api/v1/alerts` |
| Reports | `POST /api/v1/reports/generate` |
| Advanced evaluation | `GET /api/v1/evaluation/advanced` |
| Capabilities | `GET /api/v1/system/capabilities` |

## Production profiles

### Core services

```bash
docker compose up --build
```

Uses PostgreSQL + pgvector, Redis and the FastAPI application.

### Neural/LLM profile

```bash
docker compose -f docker-compose.yml -f docker-compose.ml.yml up --build
```

Adds a model-capable image and Ollama. Run/download the configured models before claiming neural model performance.

### Observability

```bash
docker compose -f docker-compose.yml -f docker-compose.observability.yml up --build
```

Prometheus: `http://localhost:9090`
Grafana: `http://localhost:3001`

### S3-compatible local storage

```bash
docker compose -f docker-compose.storage.yml up
```

This starts MinIO. Create a bucket and configure `S3_BUCKET`/`S3_ENDPOINT_URL` before using it.

## Resume rule

Only claim what you actually ran and measured. The offline fallback paths are deliberately transparent. If you activate SentenceTransformers, cross-encoder reranking, FinBERT, XGBoost/LightGBM, a live SEC feed or an LLM provider, capture the configuration and evaluation numbers before adding those exact claims to your resume.
