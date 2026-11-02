from fastapi import FastAPI, HTTPException
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, Field
from typing import Dict, Any, List
import time, uuid, threading

app = FastAPI(title="Scalable Real-Time Notification System")
lock = threading.Lock()
notifications: Dict[str, Dict[str, Any]] = {}
queue: List[str] = []
events: List[Dict[str, Any]] = []
idempotency: Dict[str, str] = {}
recipient_window: Dict[str, List[float]] = {}

class NotificationRequest(BaseModel):
    recipient: str
    channel: str = Field(pattern="^(email|sms|push)$")
    message: str
    idempotency_key: str
    priority: int = Field(default=5, ge=1, le=10)

HTML = """
<!doctype html><html><head><title>Notification Demo</title><style>body{font-family:Inter,Arial;margin:30px;background:#f8fafc;color:#0f172a}.card{background:white;border-radius:16px;padding:20px;margin:16px 0;box-shadow:0 10px 30px #0001}button,input,select{padding:10px;margin:6px;border-radius:8px;border:1px solid #cbd5e1}pre{background:#0f172a;color:#e2e8f0;padding:16px;border-radius:12px;overflow:auto}</style></head><body><h1>Real-Time Notification System</h1><p>Demo: queues, idempotency, retry, rate limit and event tracking.</p><div class='card'><input id='r' value='user@example.com'><select id='c'><option>email</option><option>sms</option><option>push</option></select><input id='m' value='Your order is confirmed'><button onclick='send()'>Queue Notification</button><button onclick='process()'>Process Next</button><button onclick='load()'>Load Events</button></div><pre id='out'></pre><script>
const out=x=>document.getElementById('out').textContent=JSON.stringify(x,null,2);
async function send(){out(await (await fetch('/notifications',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({recipient:document.getElementById('r').value,channel:document.getElementById('c').value,message:document.getElementById('m').value,idempotency_key:'demo-'+Date.now(),priority:8})})).json())}
async function process(){out(await (await fetch('/workers/process-next',{method:'POST'})).json())}
async function load(){out(await (await fetch('/events')).json())}
load();</script></body></html>
"""

def emit(t, p): events.append({"type":t,"payload":p,"ts":round(time.time(),3)})

def rate_limit_ok(recipient: str):
    now = time.time(); window = [t for t in recipient_window.get(recipient, []) if now - t < 60]
    if len(window) >= 5: return False
    window.append(now); recipient_window[recipient] = window; return True

@app.get('/', response_class=HTMLResponse)
def home(): return HTML

@app.post('/notifications')
def create_notification(req: NotificationRequest):
    with lock:
        if req.idempotency_key in idempotency:
            nid = idempotency[req.idempotency_key]
            return {"deduplicated":True, "notification":notifications[nid]}
        if not rate_limit_ok(req.recipient): raise HTTPException(429, "Recipient rate limit exceeded")
        nid = str(uuid.uuid4())[:8]
        notifications[nid] = {"id":nid,"recipient":req.recipient,"channel":req.channel,"message":req.message,"priority":req.priority,"attempts":0,"status":"QUEUED"}
        idempotency[req.idempotency_key] = nid
        queue.append(nid); queue.sort(key=lambda x: -notifications[x]['priority'])
        emit('NOTIFICATION_QUEUED', {"notification_id":nid,"channel":req.channel})
        return {"deduplicated":False, "notification":notifications[nid]}

def provider_send(n):
    if 'fail' in n['message'].lower() and n['attempts'] == 1:
        return False, 'temporary provider failure'
    return True, f"sent via {n['channel']}"

@app.post('/workers/process-next')
def process_next():
    with lock:
        if not queue: return {"message":"queue empty"}
        nid = queue.pop(0); n = notifications[nid]; n['attempts'] += 1; n['status'] = 'SENDING'; emit('DELIVERY_STARTED', {"notification_id":nid,"attempt":n['attempts']})
        ok, result = provider_send(n)
        if ok:
            n['status'] = 'DELIVERED'; n['result'] = result; emit('DELIVERED', {"notification_id":nid})
        else:
            n['result'] = result
            if n['attempts'] < 3:
                n['status'] = 'RETRY'; queue.append(nid); emit('RETRY_QUEUED', {"notification_id":nid})
            else:
                n['status'] = 'FAILED'; emit('FAILED', {"notification_id":nid})
        return n

@app.get('/notifications')
def list_notifications():
    with lock: return {"notifications": list(notifications.values()), "queue": queue}

@app.get('/events')
def list_events(): return {"events": events[-50:]}

@app.post('/reset')
def reset():
    with lock: notifications.clear(); queue.clear(); events.clear(); idempotency.clear(); recipient_window.clear()
    return {"status":"reset"}
