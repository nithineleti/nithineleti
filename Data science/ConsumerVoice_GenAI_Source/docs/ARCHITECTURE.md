# Architecture

```mermaid
flowchart TD
    A["Reviews, email and surveys"] --> B["Validation + PII redaction"]
    B --> C["Sentiment, topic and urgency models"]
    B --> D["Local retrieval index"]
    C --> E["Consumer dashboard"]
    D --> F["Grounded answer generator"]
    F --> E
    E --> G["Human action queue"]
```

## Runtime requirements

- Python 3.11 or 3.12
- NumPy, Pandas and scikit-learn
- Gradio and Plotly
- FastAPI, Pydantic and Uvicorn
- Joblib and Matplotlib

## Optional local GenAI requirements

- Transformers
- PyTorch
- SentencePiece
- Internet access on the first model download

## Production additions

Multilingual sentence embeddings, FAISS or a managed vector store, streaming ingestion, RBAC, audit logs, model registry, annotation workflow and product-level drift monitoring.
