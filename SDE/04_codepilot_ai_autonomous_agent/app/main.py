from fastapi import FastAPI
from fastapi.responses import HTMLResponse
from pydantic import BaseModel
from pathlib import Path
from typing import List, Dict, Any
import difflib, re, time

app = FastAPI(title="CodePilot AI - Autonomous Software Engineering Agent")
BASE = Path(__file__).resolve().parents[1]
REPO = BASE / 'sample_repo'

class AnalyzeRequest(BaseModel):
    bug_report: str = "Calculator crashes when divide is called with zero. Expected safe None result."

HTML = """
<!doctype html><html><head><title>CodePilot AI Demo</title><style>body{font-family:Inter,Arial;margin:30px;background:#f8fafc;color:#0f172a}.card{background:white;border-radius:16px;padding:20px;margin:16px 0;box-shadow:0 10px 30px #0001}button,textarea{padding:10px;margin:6px;border-radius:8px;border:1px solid #cbd5e1;width:90%}pre{background:#0f172a;color:#e2e8f0;padding:16px;border-radius:12px;overflow:auto}</style></head><body><h1>CodePilot AI</h1><p>Demo: bug report -> code retrieval -> patch -> validation.</p><div class='card'><textarea id='bug' rows='4'>Calculator crashes when divide is called with zero. Expected safe None result.</textarea><br><button onclick='analyze()'>Analyze Bug Report</button></div><pre id='out'></pre><script>
const out=x=>document.getElementById('out').textContent=JSON.stringify(x,null,2);
async function analyze(){out(await (await fetch('/analyze',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({bug_report:document.getElementById('bug').value})})).json())}
analyze();</script></body></html>
"""

def tokenize(text: str): return set(re.findall(r"[a-zA-Z_]+", text.lower()))

def load_files():
    files=[]
    for path in REPO.rglob('*'):
        if path.is_file() and path.suffix in ('.py','.md'):
            files.append({"path": str(path.relative_to(REPO)), "content": path.read_text()})
    return files

def retrieve(query: str):
    q = tokenize(query)
    scored=[]
    for f in load_files():
        score = len(q & tokenize(f['content'] + ' ' + f['path']))
        scored.append({"path":f['path'],"score":score,"preview":f['content'][:220]})
    return sorted(scored, key=lambda x:x['score'], reverse=True)[:3]

def make_patch(original: str, bug_report: str):
    patched = original
    if 'zero' in bug_report.lower() and 'divide' in original:
        patched = original.replace('def divide(a, b):\n    return a / b', 'def divide(a, b):\n    if b == 0:\n        return None\n    return a / b')
    diff = ''.join(difflib.unified_diff(original.splitlines(True), patched.splitlines(True), fromfile='calculator.py', tofile='calculator.py'))
    return patched, diff

def validate(patched_code: str):
    namespace: Dict[str, Any] = {}
    exec(patched_code, namespace)
    checks = [
        ("add works", namespace['add'](2,3) == 5),
        ("divide normal case", namespace['divide'](10,2) == 5),
        ("divide by zero safe result", namespace['divide'](10,0) is None),
    ]
    return {"passed": all(x[1] for x in checks), "checks": [{"name":n,"passed":p} for n,p in checks]}

@app.get('/', response_class=HTMLResponse)
def home(): return HTML

@app.post('/analyze')
def analyze(req: AnalyzeRequest):
    retrieved = retrieve(req.bug_report)
    calc = REPO / 'calculator.py'
    original = calc.read_text()
    patched, diff = make_patch(original, req.bug_report)
    test_result = validate(patched)
    return {"bug_report":req.bug_report,"retrieved_context":retrieved,"generated_diff":diff,"validation":test_result,"review_status":"READY_FOR_HUMAN_REVIEW" if test_result['passed'] else "NEEDS_ENGINEER"}

@app.get('/repo/files')
def files(): return {"files": load_files()}
