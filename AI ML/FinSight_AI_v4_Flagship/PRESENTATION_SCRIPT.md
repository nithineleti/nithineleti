# FinSight AI v4 Presentation Script

## Opening

"FinSight AI is an agentic financial intelligence platform I built to reduce the manual work of researching company performance, risks, guidance and future trends. Instead of sending an entire document to one model, the system retrieves evidence, reasons over a financial knowledge graph, adds structured facts and ML analytics, and validates citations before returning a result."

## Architecture explanation

"The backend is FastAPI. Documents are chunked and indexed for sparse BM25 and dense retrieval. In production, dense vectors can be stored in PostgreSQL pgvector. A persisted knowledge graph represents company, products, risks, metrics, guidance and competitors. The agent orchestrator invokes specialized research modules, and the generator can use a deterministic extractive path or a pluggable LLM."

## ML explanation

"The forecasting module does not choose a model by intuition. It runs rolling one-step backtests across statistical, tree-based and ensemble models and selects the available model with the lowest MAE. I also track RMSE and MAPE and provide residual-based uncertainty intervals and scenario analysis."

## RAG evaluation explanation

"I measure retrieval using Recall@5, Precision@5, MRR and NDCG. The end-to-end layer checks citation precision and recall and uses an offline lexical support score as a transparent faithfulness proxy. I would replace that proxy with a labeled human/judge evaluation for a real production benchmark."

## Production explanation

"The local demo uses SQLite and deterministic vectors so it is easy to run. The same interfaces support PostgreSQL/pgvector, Redis, S3-compatible storage, neural embeddings/reranking, FinBERT, SEC feeds, OpenTelemetry and container deployment."

## Limitation to say confidently

"The included financial data is fictional and the bundled evaluation set is deliberately small. I use it to prove the workflow and engineering design, not to claim market-level prediction accuracy. A production release needs larger licensed datasets, stricter financial validation, load testing and operational controls."
