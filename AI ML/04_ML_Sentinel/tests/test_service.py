from app.service import service
def test_metrics_exist(): assert service.metrics["roc_auc"]>0.5
def test_shifted_data_triggers_drift(): assert service.drift("shifted")["status"]=="drift_detected"
def test_prediction():
    r=service.predict({"age":40,"income":60000,"utilization":.5,"late_payments":1,"tenure_years":4})
    assert 0<=r["probability"]<=1
