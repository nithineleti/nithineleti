from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_order_payment_flow():
    client.post('/reset')
    products = client.get('/products').json()['products']
    assert products[0]['stock'] == 8
    payload = {'user_id':'u1','idempotency_key':'abc','items':[{'product_id':1,'quantity':1}]}
    r1 = client.post('/orders', json=payload).json()
    r2 = client.post('/orders', json=payload).json()
    assert r2['deduplicated'] is True
    paid = client.post(f"/payments/{r1['order_id']}/capture").json()
    assert paid['status'] == 'PAID'
    events = client.get('/events').json()['events']
    assert any(e['type'] == 'ORDER_RESERVED' for e in events)
