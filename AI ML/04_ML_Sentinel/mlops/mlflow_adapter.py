"""Optional MLflow integration. Install mlflow to enable experiment tracking."""
def log_run(metrics, params=None):
    import mlflow
    with mlflow.start_run():
        if params: mlflow.log_params(params)
        mlflow.log_metrics({k:v for k,v in metrics.items() if isinstance(v,(int,float))})
