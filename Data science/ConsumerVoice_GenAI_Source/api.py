from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from src.service import ConsumerVoiceService


app = FastAPI(title="ConsumerVoice GenAI API", version="1.0.0")
service = ConsumerVoiceService()


class AnalyseRequest(BaseModel):
    text: str = Field(min_length=8, max_length=5000)


class AskRequest(BaseModel):
    question: str = Field(min_length=5, max_length=1000)


@app.get("/health")
def health():
    return {"status": "healthy", "model_trained_at": service.bundle.trained_at}


@app.post("/analyse")
def analyse(request: AnalyseRequest):
    try:
        return service.analyze(request.text)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/ask")
def ask(request: AskRequest):
    try:
        answer, evidence = service.ask(request.question)
        return {"answer": answer, "evidence": evidence.assign(date=lambda x: x["date"].astype(str)).to_dict("records")}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
