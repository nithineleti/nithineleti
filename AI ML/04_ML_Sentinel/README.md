# ML Sentinel — Model Lifecycle & Drift Monitoring
A runnable MLOps demo that trains a classification model, serves predictions, detects feature drift with PSI, versions retraining runs and exposes everything in a monitoring dashboard.

## Run
`./run.sh` → `http://localhost:8000`.

The core demo has no external infrastructure requirement. Optional `mlops/` and `airflow/` adapters show how to connect MLflow and scheduled retraining in a larger deployment.
