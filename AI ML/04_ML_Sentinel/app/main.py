from fastapi import FastAPI
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from pathlib import Path
from .service import service
app=FastAPI(title="ML Sentinel",version="1.0.0"); BASE=Path(__file__).resolve().parents[1]
class Record(BaseModel):
    age:float=Field(ge=18,le=100); income:float=Field(gt=0); utilization:float=Field(ge=0,le=1); late_payments:int=Field(ge=0,le=50); tenure_years:float=Field(ge=0,le=60)
@app.get("/")
def home(): return FileResponse(BASE/"static/index.html")
@app.get("/health")
def health(): return {"status":"ok","service":"ml-sentinel"}
@app.get("/api/metrics")
def metrics(): return service.metrics
@app.post("/api/predict")
def predict(r:Record): return service.predict(r.model_dump())
@app.get("/api/drift")
def drift(mode:str="stable"): return service.drift(mode)
@app.post("/api/retrain")
def retrain(): return service.train()
@app.get("/api/history")
def history(): return {"events":service.history}
