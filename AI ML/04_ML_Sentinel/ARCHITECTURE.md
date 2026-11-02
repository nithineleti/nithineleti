# Architecture
`Training data → Preprocessing Pipeline → Logistic Model → Metrics/Version → FastAPI Serving → Prediction Events`

`Reference distributions + Incoming batch → PSI Monitor → Drift Status → Alert / Retraining decision`

Optional: MLflow tracking + Airflow retraining schedule + container deployment + CI.
