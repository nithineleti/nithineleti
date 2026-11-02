# FinSight AI v4 Feature Matrix

The project intentionally distinguishes **active**, **offline demo**, **optional model**, and **external production** features. Check `/api/v1/system/features` for the machine-readable version.

| Area | Feature | Demo status |
|---|---|---|
| Security | JWT authentication, scrypt passwords, workspace/RBAC model | Active |
| Documents | PDF/TXT/MD upload, hashing, deduplication, provenance | Active |
| Multimodal | PDF/table extraction, financial table scoring, chart references | Active |
| OCR | pytesseract adapter | Optional deployment dependency |
| Filings | SEC 10-K/10-Q/8-K adapter | Requires internet + SEC User-Agent |
| XBRL | Companyfacts normalization | Bundled demo + live SEC adapter |
| Retrieval | BM25 | Active |
| Retrieval | Dense 384d local vectors | Active |
| Retrieval | SentenceTransformers | Optional model |
| Vector DB | pgvector/HNSW | Production Compose path |
| Retrieval | Hybrid fusion + reranking | Active |
| Graph | Persisted financial knowledge graph | Active |
| Graph | GraphRAG query context | Active |
| Generation | Citation-grounded extractive generator | Active |
| Generation | Ollama/chat-completions provider adapter | Optional external model |
| Safety | Citation validation + fallback | Active |
| Safety | Prompt-injection guard | Active |
| NLP | Financial lexicon sentiment | Active |
| NLP | FinBERT | Optional model |
| Finance | KPI/ratio/risk/guidance extraction | Active |
| Earnings | Speaker-role, sentiment, questions, guidance, uncertainty, topics | Active demo |
| Events | News/event classification, sentiment, impact score | Active demo |
| Forecast | Statistical baselines, Holt, ARIMA | Active |
| Forecast | Gradient Boosting, Random Forest | Active |
| Forecast | XGBoost, LightGBM | Optional if installed |
| Forecast | Ensemble, rolling evaluation, intervals, scenarios | Active |
| ML | IsolationForest + robust anomaly detection | Active |
| Research | Multi-agent orchestration + execution trace | Active |
| Research | Company comparison | Active |
| Product | Watchlists + event alert rules | Active |
| Product | Portfolio P&L/concentration analytics | Active |
| Reports | Markdown + PDF research reports | Active |
| Evaluation | Recall@5, Precision@5, MRR, NDCG@5 | Active |
| Evaluation | Citation precision/recall, faithfulness proxy | Active |
| Ops | Redis/memory cache + rate limiting | Active fallback / optional Redis |
| Ops | Prometheus, logs, health checks | Active |
| Ops | OpenTelemetry | Optional OTLP endpoint |
| Ops | Docker, PostgreSQL/pgvector, CI | Active configuration |
| Ops | MinIO, Grafana profiles | Optional deployment profiles |

## Interview rule

The safest and strongest claim is: "I designed the system so heavyweight services are pluggable, while the default demo remains deterministic and fully runnable." Do not claim a neural model or external service was deployed unless you actually ran it.
