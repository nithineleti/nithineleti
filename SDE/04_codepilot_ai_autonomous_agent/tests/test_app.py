from fastapi.testclient import TestClient
from app.main import app
client = TestClient(app)

def test_analyze_generates_valid_patch():
    result = client.post('/analyze', json={'bug_report':'divide by zero crashes calculator'}).json()
    assert result['validation']['passed'] is True
    assert 'if b == 0' in result['generated_diff']
    assert result['review_status'] == 'READY_FOR_HUMAN_REVIEW'
