# FinSight AI v4 Architecture

## 1. Product boundary

FinSight is a financial research and ML engineering platform. It does not execute trades or provide personalized investment advice. The system prioritizes provenance, citations, measurable retrieval quality and transparent fallbacks.

## 2. Main request flow

```text
User question
  -> Guardrail inspection
  -> Research Planner
  -> Evidence Retrieval Agent
       -> BM25
       -> Dense embeddings
       -> GraphRAG context
       -> weighted fusion
       -> reranker
  -> Fundamentals/XBRL Agent
  -> Risk + Guidance Agent
  -> Earnings Agent
  -> Event Agent
  -> Forecast + Anomaly Agent
  -> Grounded Synthesis
  -> Citation Verification
  -> Confidence + agent trace
  -> UI / PDF report
```

## 3. Retrieval layer

- BM25 provides exact lexical matching.
- Dense embeddings provide semantic similarity. The default is a deterministic 384-dimensional local hashing vector so the demo has no download dependency.
- SentenceTransformers is an optional real neural embedding backend.
- PostgreSQL deployments can persist/search vectors through pgvector with HNSW.
- GraphRAG adds company/product/risk/guidance/metric relationship context.
- A feature reranker is the default. A cross-encoder reranker is optional.

## 4. Financial knowledge graph

The graph is a derived index stored in `knowledge_entities` and `knowledge_relations`. It models:

- Company -> sector / industry
- Company -> product/service
- Company -> competitor
- Company -> reported metric
- Company -> risk category
- Company -> management guidance
- Company -> growth driver

NetworkX is used for local graph traversal and path reasoning. The SQL representation makes the index inspectable and durable. A future high-scale deployment could move graph storage to Neo4j while preserving the API contract.

## 5. Financial intelligence

### Structured data

- XBRL/companyfacts adapter normalizes common US-GAAP facts.
- Derived ratios include gross, operating and net margins when sufficient fields exist.

### Unstructured data

- KPI regex extraction with evidence.
- Risk category extraction with evidence.
- Guidance detection.
- Earnings transcript management-vs-analyst sentiment and topic mapping.
- Event/news classification with sentiment and impact score.

## 6. Forecasting

Every supported model is evaluated with rolling one-step backtesting where possible:

- Naive last value
- Moving average
- Drift
- Linear trend
- Holt damped trend
- ARIMA(1,1,0)
- Gradient Boosting with lag features
- Random Forest with lag features
- XGBoost lag model if installed
- LightGBM lag model if installed
- Trend ensemble

The lowest-MAE available model is selected. Outputs include MAE/RMSE/MAPE, approximate residual-based 95% intervals and user-defined bull/base/bear sensitivities.

## 7. Multimodal document layer

- Pypdf text extraction.
- Pdfplumber table extraction and financial-table scoring.
- Markdown table extraction.
- Chart/figure reference detection.
- OCR adapter status for scanned PDFs. Full raster OCR requires Poppler/pdf2image in the deployment image.

## 8. Security

- JWT bearer tokens.
- scrypt password hashing.
- User-scoped uploads.
- Workspace/RBAC data model.
- Rate limiting.
- Prompt-injection detection.
- Citation guard and extractive fallback.
- Audit trail for research requests.
- CORS allowlist.
- No secrets in source; `.env.example` documents required variables.

## 9. Persistence

Local: SQLite.
Production: PostgreSQL + pgvector.
Optional cache/rate limiter: Redis.
Optional binary storage: S3-compatible object store.

## 10. Observability

- Request IDs.
- Structured request logs.
- Prometheus counters/histograms.
- `/health/live` and `/health/ready`.
- Optional OpenTelemetry OTLP exporter.
- Optional Prometheus/Grafana Compose profile.

## 11. Deployment

The static SPA is served by FastAPI so the complete demo runs as one deployable service. This keeps the interview demo deterministic. The frontend can later be split into a Next.js deployment without changing backend APIs.
