from fastapi import FastAPI, HTTPException
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, Field
from typing import Dict, Any, Optional, List
import threading, time, uuid

app = FastAPI(title="Distributed Task Queue and Job Scheduler")
lock = threading.Lock()
jobs: Dict[str, Dict[str, Any]] = {}
events: List[Dict[str, Any]] = []

class JobRequest(BaseModel):
    name: str
    payload: Dict[str, Any] = {}
    priority: int = Field(default=5, ge=1, le=10)
    scheduled_in_seconds: int = Field(default=0, ge=0)
    max_retries: int = Field(default=2, ge=0, le=5)
    fail_first: bool = False

HTML = """
<!doctype html><html><head><title>Scheduler Demo</title><style>body{font-family:Inter,Arial;margin:30px;background:#f8fafc;color:#0f172a}.card{background:white;border-radius:16px;padding:20px;margin:16px 0;box-shadow:0 10px 30px #0001}button,input{padding:10px;margin:6px;border-radius:8px;border:1px solid #cbd5e1}pre{background:#0f172a;color:#e2e8f0;padding:16px;border-radius:12px;overflow:auto}</style></head><body>
<h1>Distributed Task Queue and Scheduler</h1><p>Demo: priority queue, scheduled execution, retries and dead-letter queue.</p><div class='card'><button onclick='create(false)'>Create Job</button><button onclick='create(true)'>Create Fail-First Job</button><button onclick='runNext()'>Run Next Job</button><button onclick='loadJobs()'>Load Jobs</button></div><pre id='out'></pre><script>
const out=x=>document.getElementById('out').textContent=JSON.stringify(x,null,2);
async function create(fail){out(await (await fetch('/jobs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:fail?'email-retry-demo':'image-resize',payload:{file:'demo.png'},priority:fail?10:6,fail_first:fail})})).json())}
async function runNext(){out(await (await fetch('/workers/run-next',{method:'POST'})).json())}
async function loadJobs(){out(await (await fetch('/jobs')).json())}
loadJobs();</script></body></html>
"""

def emit(t, p): events.append({"type":t,"payload":p,"ts":round(time.time(),3)})

@app.get('/', response_class=HTMLResponse)
def home(): return HTML

@app.post('/jobs')
def create_job(req: JobRequest):
    job_id = str(uuid.uuid4())[:8]
    with lock:
        jobs[job_id] = {"id":job_id,"name":req.name,"payload":req.payload,"priority":req.priority,"scheduled_at":time.time()+req.scheduled_in_seconds,"max_retries":req.max_retries,"attempts":0,"fail_first":req.fail_first,"status":"PENDING","result":None}
    emit('JOB_CREATED', {"job_id":job_id,"priority":req.priority})
    return jobs[job_id]

@app.get('/jobs')
def list_jobs():
    with lock: return {"jobs": sorted(jobs.values(), key=lambda j:(j['status'], -j['priority'])) , "events": events[-20:]}

def pick_due_job():
    now = time.time()
    due = [j for j in jobs.values() if j['status'] in ('PENDING','RETRY') and j['scheduled_at'] <= now]
    if not due: return None
    return sorted(due, key=lambda j: (-j['priority'], j['scheduled_at']))[0]

@app.post('/workers/run-next')
def run_next():
    with lock:
        job = pick_due_job()
        if not job: return {"message":"No due jobs", "queue_size": len(jobs)}
        job['attempts'] += 1; job['status'] = 'RUNNING'; emit('JOB_STARTED', {"job_id":job['id'],"attempt":job['attempts']})
        if job['fail_first'] and job['attempts'] == 1:
            if job['attempts'] <= job['max_retries']:
                job['status'] = 'RETRY'; job['scheduled_at'] = time.time() + 1; job['result'] = 'temporary provider failure'
                emit('JOB_RETRY_SCHEDULED', {"job_id":job['id']})
            else:
                job['status'] = 'DEAD_LETTER'; emit('JOB_DEAD_LETTERED', {"job_id":job['id']})
        else:
            job['status'] = 'COMPLETED'; job['result'] = f"processed {job['name']}"; emit('JOB_COMPLETED', {"job_id":job['id']})
        return job

@app.get('/stats')
def stats():
    with lock:
        counts = {}
        for j in jobs.values(): counts[j['status']] = counts.get(j['status'],0)+1
        return {"counts":counts, "total":len(jobs)}

@app.post('/reset')
def reset():
    with lock: jobs.clear(); events.clear()
    return {"status":"reset"}
