from fastapi import FastAPI, HTTPException
from fastapi.responses import HTMLResponse
from pydantic import BaseModel
from typing import Dict, Any, List, Optional
import hashlib, bisect, time, threading

app = FastAPI(title="Distributed Key-Value Store")
lock = threading.Lock()
REPLICATION_FACTOR = 2
NODES = {f"node-{i}": {"status":"UP", "data":{}} for i in range(1,5)}

class PutRequest(BaseModel):
    value: Any
    ttl_seconds: Optional[int] = None

HTML = """
<!doctype html><html><head><title>KV Store Demo</title><style>body{font-family:Inter,Arial;margin:30px;background:#f8fafc;color:#0f172a}.card{background:white;border-radius:16px;padding:20px;margin:16px 0;box-shadow:0 10px 30px #0001}button,input{padding:10px;margin:6px;border-radius:8px;border:1px solid #cbd5e1}pre{background:#0f172a;color:#e2e8f0;padding:16px;border-radius:12px;overflow:auto}</style></head><body><h1>Distributed Key-Value Store</h1><p>Demo: consistent hashing, replication, TTL, and node failure.</p><div class='card'><input id='k' value='cart:101'><input id='v' value='keyboard'><button onclick='put()'>PUT</button><button onclick='getv()'>GET</button><button onclick='nodes()'>Nodes</button><button onclick='down()'>Take node-1 Down</button></div><pre id='out'></pre><script>
const out=x=>document.getElementById('out').textContent=JSON.stringify(x,null,2);
async function put(){out(await (await fetch('/kv/'+document.getElementById('k').value,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({value:document.getElementById('v').value,ttl_seconds:60})})).json())}
async function getv(){out(await (await fetch('/kv/'+document.getElementById('k').value)).json())}
async function nodes(){out(await (await fetch('/nodes')).json())}
async function down(){out(await (await fetch('/nodes/node-1/down',{method:'POST'})).json())}
nodes();</script></body></html>
"""

def h(s: str) -> int: return int(hashlib.sha256(s.encode()).hexdigest(), 16)

def ring():
    r=[]
    for node, meta in NODES.items():
        if meta['status'] == 'UP':
            for replica in range(32): r.append((h(f"{node}:{replica}"), node))
    r.sort(); return r

def route(key: str) -> List[str]:
    r = ring()
    if not r: raise HTTPException(503, "No healthy nodes")
    idx = bisect.bisect_left([x[0] for x in r], h(key)) % len(r)
    chosen=[]; i=idx
    while len(chosen) < min(REPLICATION_FACTOR, len({x[1] for x in r})):
        node = r[i % len(r)][1]
        if node not in chosen: chosen.append(node)
        i += 1
    return chosen

def is_expired(rec): return rec['expires_at'] is not None and rec['expires_at'] < time.time()

@app.get('/', response_class=HTMLResponse)
def home(): return HTML

@app.put('/kv/{key}')
def put_key(key: str, req: PutRequest):
    nodes = route(key); expires_at = time.time() + req.ttl_seconds if req.ttl_seconds else None
    with lock:
        for n in nodes: NODES[n]['data'][key] = {"value":req.value,"expires_at":expires_at,"written_at":round(time.time(),3)}
    return {"key":key,"stored_on":nodes,"replication_factor":len(nodes)}

@app.get('/kv/{key}')
def get_key(key: str):
    nodes = route(key)
    with lock:
        for n in nodes:
            rec = NODES[n]['data'].get(key)
            if rec and not is_expired(rec): return {"key":key,"value":rec['value'],"served_by":n,"replicas":nodes}
            if rec and is_expired(rec): del NODES[n]['data'][key]
    raise HTTPException(404, "Key not found")

@app.delete('/kv/{key}')
def delete_key(key: str):
    nodes = route(key); deleted=[]
    with lock:
        for n in nodes:
            if key in NODES[n]['data']: del NODES[n]['data'][key]; deleted.append(n)
    return {"key":key,"deleted_from":deleted}

@app.get('/nodes')
def nodes():
    with lock:
        return {"nodes": {n:{"status":m['status'],"keys":list(m['data'].keys())} for n,m in NODES.items()}, "ring_virtual_nodes": len(ring())}

@app.post('/nodes/{node}/down')
def node_down(node: str):
    if node not in NODES: raise HTTPException(404, "node not found")
    NODES[node]['status']='DOWN'; return {"node":node,"status":"DOWN"}

@app.post('/nodes/{node}/up')
def node_up(node: str):
    if node not in NODES: raise HTTPException(404, "node not found")
    NODES[node]['status']='UP'; return {"node":node,"status":"UP"}

@app.post('/reset')
def reset():
    with lock:
        for m in NODES.values(): m['status']='UP'; m['data'].clear()
    return {"status":"reset"}
