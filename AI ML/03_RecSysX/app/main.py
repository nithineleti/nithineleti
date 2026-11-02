from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import FileResponse
from pathlib import Path
from .engine import engine
app=FastAPI(title="RecSysX",version="1.0.0"); BASE=Path(__file__).resolve().parents[1]
@app.get("/")
def home(): return FileResponse(BASE/"static/index.html")
@app.get("/health")
def health(): return {"status":"ok","service":"recsysx"}
@app.get("/api/users")
def users(): return {"users":engine.users}
@app.get("/api/recommend")
def recommend(user_id:str="u1",k:int=Query(5,ge=1,le=10)):
    try:return engine.recommend(user_id,k)
    except ValueError as e: raise HTTPException(404,str(e))
@app.get("/api/metrics")
def metrics(): return engine.metrics()
