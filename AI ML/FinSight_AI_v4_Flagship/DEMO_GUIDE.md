# FinSight AI v4 Demo Guide

## 5-minute interview demo

### 0:00-0:30 - Problem

"Financial research is fragmented across filings, reports, earnings calls, events and spreadsheets. FinSight combines retrieval, structured financial data, graph reasoning and forecasting into one evidence-grounded workflow."

### 0:30-1:15 - Run the flagship workflow

1. Login.
2. Click **Run Flagship Demo**.
3. Point to the visible agent trace.
4. Explain that each step is a bounded service, not one opaque prompt.

### 1:15-2:10 - Evidence + GraphRAG

Show the research answer and source cards. Point out BM25, dense, graph and rerank component scores. Open **GraphRAG** and show the company-to-risk/guidance/product relationships.

### 2:10-3:00 - Financial intelligence

Open **Financial Intelligence**. Show XBRL-style structured facts, earnings-call management sentiment, guidance, risks and recent event signals.

### 3:00-3:45 - Forecast Lab

Show the model leaderboard. Explain rolling backtesting and why the selected model is based on MAE rather than hand-picking a favorite algorithm. Show bull/base/bear scenarios.

### 3:45-4:25 - Evaluation

Open **Evaluation**. Explain Recall@5, MRR, NDCG, citation precision and the faithfulness proxy. Explicitly say the bundled numbers are demo-set measurements, not external benchmarks.

### 4:25-5:00 - Production engineering

Show `/docs`, `/metrics`, Docker/Compose, CI and the feature matrix. Explain pgvector/Redis/S3/neural model paths as optional production integrations.

## Commands

```bash
./run.sh
# browser: http://localhost:8000
python scripts/demo_api.py
pytest -q
```

## Best demo question

```text
What are Aster Systems' main growth drivers, risks, management signals and near-term revenue outlook?
```

## Backup demo questions

```text
What risks could slow Meridian Energy's grid-storage growth?
How could Northstar Retail's inventory position affect margin improvement?
Compare the evidence for Aster Systems growth versus its key operating risks.
```
