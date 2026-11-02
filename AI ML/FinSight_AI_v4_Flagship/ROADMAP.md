# Roadmap After v4

The flagship v4 intentionally stops short of pretending every external production dependency is active. The next high-value work is validation and scale rather than adding more UI buttons.

1. Build a licensed, larger financial evaluation corpus.
2. Benchmark SentenceTransformers + cross-encoder + pgvector on that corpus.
3. Add true layout-aware OCR/table models for scanned filings.
4. Connect a licensed earnings transcript/news feed.
5. Add a proper asynchronous ingestion/report worker queue.
6. Add enterprise SSO, stronger multi-tenant authorization and audit export.
7. Add load testing, SLO dashboards and chaos/restore testing.
8. Deploy to AWS with managed PostgreSQL, Redis, S3 and infrastructure-as-code.
9. Add model registry/experiment tracking for financial forecasting and NLP models.
10. Add human analyst feedback loops and offline evaluation gates before model promotion.
