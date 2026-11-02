# FinSight AI v4 Interview Q&A

## Why use hybrid retrieval?
BM25 is strong for exact financial terms and numbers, while dense retrieval helps with semantic phrasing. Their weighted fusion reduces the weaknesses of either method alone. Graph context adds relationship evidence, and reranking refines the candidate set.

## What makes this GraphRAG?
The system persists entities and relations for companies, products, risks, guidance, metrics, sectors and competitors. A graph query selects relationship context and uses those terms/evidence to augment document ranking and agent reasoning.

## Is it really multi-agent?
The project implements an orchestrated agent workflow where each agent has a bounded responsibility and observable trace: planning, retrieval, graph reasoning, fundamentals, risk/guidance, earnings, events, forecasting, synthesis and verification. The default agents are deterministic service agents; an LLM can be plugged into synthesis without changing the workflow contract.

## How do you prevent hallucinations?
The default answer generator is evidence-extractive. LLM adapters receive only retrieved evidence, require `[S#]` citations and are validated after generation. If citation validation fails, the system falls back to the extractive path.

## How do you evaluate RAG?
Recall@5, Precision@5, MRR and NDCG measure retrieval. Citation precision/recall and a lexical support proxy cover grounding. A production benchmark should use a larger labeled dataset and expert/human evaluation.

## Why not use only an LLM for financial analysis?
A standalone LLM cannot guarantee provenance or freshness. FinSight separates retrieval, structured data, models and verification so each output can be inspected and tested.

## Why multiple forecast models?
No model dominates every time series. The system uses walk-forward evaluation and chooses the best available model by MAE, while preserving RMSE/MAPE for comparison.

## What are the biggest limitations?
Bundled data is fictional and small; financial-table/OCR handling is not a full enterprise document-understanding stack; news is demo-seeded unless a licensed feed is connected; and real production usage needs more robust authorization, load testing, secrets management, model governance and financial-domain validation.

## How would you scale to 100x traffic?
Move to managed PostgreSQL/pgvector, Redis, object storage and background workers; cache immutable filing parses; make ingestion asynchronous; partition retrieval indexes; separate inference services; add autoscaling, traces and load tests; and use queue-based report generation.
