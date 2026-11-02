from fastapi.testclient import TestClient
from app.main import app
import time
client = TestClient(app)

def test_retry_and_completion():
    client.post('/reset')
    job = client.post('/jobs', json={'name':'retry-demo','priority':10,'fail_first':True}).json()
    first = client.post('/workers/run-next').json()
    assert first['status'] == 'RETRY'
    time.sleep(1.05)
    second = client.post('/workers/run-next').json()
    assert second['status'] == 'COMPLETED'
    stats = client.get('/stats').json()
    assert stats['counts']['COMPLETED'] == 1
