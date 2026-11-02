from fastapi import FastAPI, HTTPException
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, Field
from typing import List, Dict, Any
import sqlite3
import threading
import time
from pathlib import Path

DB_PATH = Path(__file__).resolve().parent / "commerce.db"
lock = threading.Lock()
event_log: List[Dict[str, Any]] = []
product_cache: Dict[str, Any] = {}

app = FastAPI(title="Distributed E-Commerce Order Management System")

class OrderItem(BaseModel):
    product_id: int
    quantity: int = Field(gt=0)

class OrderRequest(BaseModel):
    user_id: str
    idempotency_key: str
    items: List[OrderItem]

HTML = """
<!doctype html><html><head><title>Commerce Demo</title><style>
body{font-family:Inter,Arial;margin:30px;background:#f8fafc;color:#0f172a} .card{background:white;border-radius:16px;padding:20px;margin:16px 0;box-shadow:0 10px 30px #0001} button,input{padding:10px;margin:6px;border-radius:8px;border:1px solid #cbd5e1} pre{background:#0f172a;color:#e2e8f0;padding:16px;border-radius:12px;overflow:auto}
</style></head><body><h1>Distributed E-Commerce Order System</h1><p>Demo: inventory reservation, idempotent orders, payment capture and event log.</p>
<div class='card'><button onclick='loadProducts()'>Load Products</button><button onclick='placeOrder()'>Place Demo Order</button><button onclick='capturePayment()'>Capture Payment</button><button onclick='loadEvents()'>Load Events</button></div><pre id='out'></pre>
<script>
let lastOrder=null; const out=(x)=>document.getElementById('out').textContent=JSON.stringify(x,null,2);
async function loadProducts(){out(await (await fetch('/products')).json())}
async function placeOrder(){const r=await fetch('/orders',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({user_id:'student-1',idempotency_key:'demo-'+Date.now(),items:[{product_id:1,quantity:1},{product_id:2,quantity:1}]})}); const j=await r.json(); lastOrder=j.order_id; out(j)}
async function capturePayment(){if(!lastOrder) return out({error:'place order first'}); out(await (await fetch('/payments/'+lastOrder+'/capture',{method:'POST'})).json())}
async function loadEvents(){out(await (await fetch('/events')).json())}
loadProducts();
</script></body></html>
"""

def db():
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn

def init_db(reset: bool = False):
    if reset and DB_PATH.exists():
        DB_PATH.unlink()
    conn = db()
    cur = conn.cursor()
    cur.execute("CREATE TABLE IF NOT EXISTS products(id INTEGER PRIMARY KEY, name TEXT, price INTEGER, stock INTEGER)")
    cur.execute("CREATE TABLE IF NOT EXISTS orders(id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, idempotency_key TEXT UNIQUE, status TEXT, amount INTEGER, created_at REAL)")
    cur.execute("CREATE TABLE IF NOT EXISTS order_items(order_id INTEGER, product_id INTEGER, quantity INTEGER, price INTEGER)")
    if cur.execute("SELECT COUNT(*) c FROM products").fetchone()["c"] == 0:
        cur.executemany("INSERT INTO products(id,name,price,stock) VALUES(?,?,?,?)", [
            (1,"Mechanical Keyboard",4500,8),(2,"Noise Cancelling Headphones",6500,5),(3,"USB-C Hub",2500,12)
        ])
    conn.commit(); conn.close()
    product_cache.clear(); event_log.clear()

init_db(reset=True)

def emit(event_type: str, payload: Dict[str, Any]):
    event_log.append({"type": event_type, "payload": payload, "ts": round(time.time(), 3)})

@app.get("/", response_class=HTMLResponse)
def home(): return HTML

@app.get("/products")
def products():
    if "products" in product_cache:
        return {"source":"cache", "products": product_cache["products"]}
    conn=db(); rows=[dict(r) for r in conn.execute("SELECT * FROM products").fetchall()]; conn.close()
    product_cache["products"] = rows
    return {"source":"database", "products": rows}

@app.post("/orders")
def create_order(req: OrderRequest):
    if not req.items:
        raise HTTPException(400, "Order must contain at least one item")
    with lock:
        conn=db(); cur=conn.cursor()
        existing = cur.execute("SELECT id,status,amount FROM orders WHERE idempotency_key=?", (req.idempotency_key,)).fetchone()
        if existing:
            conn.close(); return {"deduplicated": True, "order_id": existing["id"], "status": existing["status"], "amount": existing["amount"]}
        amount = 0
        for item in req.items:
            product = cur.execute("SELECT * FROM products WHERE id=?", (item.product_id,)).fetchone()
            if not product: raise HTTPException(404, f"Product {item.product_id} not found")
            if product["stock"] < item.quantity: raise HTTPException(409, f"Insufficient stock for {product['name']}")
            amount += product["price"] * item.quantity
        cur.execute("INSERT INTO orders(user_id,idempotency_key,status,amount,created_at) VALUES(?,?,?,?,?)", (req.user_id, req.idempotency_key, "RESERVED", amount, time.time()))
        order_id = cur.lastrowid
        for item in req.items:
            product = cur.execute("SELECT * FROM products WHERE id=?", (item.product_id,)).fetchone()
            cur.execute("UPDATE products SET stock=stock-? WHERE id=?", (item.quantity, item.product_id))
            cur.execute("INSERT INTO order_items(order_id,product_id,quantity,price) VALUES(?,?,?,?)", (order_id, item.product_id, item.quantity, product["price"]))
        conn.commit(); conn.close(); product_cache.clear()
        emit("ORDER_RESERVED", {"order_id": order_id, "amount": amount})
        return {"deduplicated": False, "order_id": order_id, "status": "RESERVED", "amount": amount}

@app.get("/orders/{order_id}")
def get_order(order_id: int):
    conn=db(); order=conn.execute("SELECT * FROM orders WHERE id=?", (order_id,)).fetchone()
    if not order: raise HTTPException(404, "Order not found")
    items=[dict(r) for r in conn.execute("SELECT * FROM order_items WHERE order_id=?", (order_id,)).fetchall()]
    conn.close(); return {"order": dict(order), "items": items}

@app.post("/payments/{order_id}/capture")
def capture_payment(order_id: int):
    with lock:
        conn=db(); cur=conn.cursor(); order=cur.execute("SELECT * FROM orders WHERE id=?", (order_id,)).fetchone()
        if not order: raise HTTPException(404, "Order not found")
        if order["status"] == "PAID": return {"order_id": order_id, "status": "PAID", "deduplicated": True}
        if order["status"] != "RESERVED": raise HTTPException(409, "Order cannot be paid")
        cur.execute("UPDATE orders SET status='PAID' WHERE id=?", (order_id,)); conn.commit(); conn.close()
        emit("PAYMENT_CAPTURED", {"order_id": order_id, "amount": order["amount"]})
        emit("NOTIFICATION_QUEUED", {"order_id": order_id, "channel": "email"})
        return {"order_id": order_id, "status": "PAID", "amount": order["amount"]}

@app.get("/events")
def events(): return {"events": event_log[-50:]}

@app.post("/reset")
def reset(): init_db(reset=True); return {"status":"reset"}
