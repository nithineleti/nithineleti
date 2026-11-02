from fastapi.testclient import TestClient
from app.main import app
client = TestClient(app)

def test_notification_idempotency_and_retry():
    client.post('/reset')
    payload = {'recipient':'u@example.com','channel':'email','message':'fail once then deliver','idempotency_key':'same','priority':10}
    first = client.post('/notifications', json=payload).json()
    second = client.post('/notifications', json=payload).json()
    assert second['deduplicated'] is True
    r1 = client.post('/workers/process-next').json()
    assert r1['status'] == 'RETRY'
    r2 = client.post('/workers/process-next').json()
    assert r2['status'] == 'DELIVERED'
