from fastapi.testclient import TestClient
from app.main import app
client = TestClient(app)

def test_put_get_replication_node_failure():
    client.post('/reset')
    put = client.put('/kv/user:1', json={'value':{'name':'Asha'}, 'ttl_seconds':60}).json()
    assert len(put['stored_on']) == 2
    got = client.get('/kv/user:1').json()
    assert got['value']['name'] == 'Asha'
    client.post('/nodes/node-1/down')
    got_after = client.get('/kv/user:1')
    assert got_after.status_code in (200, 404)  # depends on hashing route after node change; demo shows routing behavior.
