from fastapi import FastAPI
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from pathlib import Path
from .engine import analyze_bug

app = FastAPI(title="CodePilot AI", version="1.0.0")
BASE = Path(__file__).resolve().parents[1]
class BugRequest(BaseModel):
    bug_report: str = Field(min_length=8, max_length=1200)
@app.get("/")
def home(): return FileResponse(BASE/"static/index.html")
@app.get("/health")
def health(): return {"status":"ok","service":"codepilot"}
@app.post("/api/analyze")
def analyze(req: BugRequest): return analyze_bug(req.bug_report)
