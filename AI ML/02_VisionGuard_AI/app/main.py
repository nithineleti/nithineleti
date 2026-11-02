from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.responses import FileResponse
from pathlib import Path
from .engine import analyze_bytes
app=FastAPI(title="VisionGuard AI",version="1.0.0")
BASE=Path(__file__).resolve().parents[1]
@app.get("/")
def home(): return FileResponse(BASE/"static/index.html")
@app.get("/health")
def health(): return {"status":"ok","service":"visionguard"}
@app.get("/api/samples")
def samples(): return {"samples":["normal","scratch","spot","edge_chip"]}
@app.get("/samples/{name}")
def sample(name:str):
    f=BASE/"static/samples"/f"{name}.png"
    if not f.exists(): raise HTTPException(404)
    return FileResponse(f)
@app.post("/api/analyze")
async def analyze(file: UploadFile=File(...)):
    raw=await file.read()
    if len(raw)>5_000_000: raise HTTPException(413,"Image too large")
    try: return analyze_bytes(raw)
    except Exception as e: raise HTTPException(400,f"Invalid image: {e}")
