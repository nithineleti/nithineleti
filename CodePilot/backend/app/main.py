from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select, text

from .api import router
from .database import SessionLocal, engine, init_db
from .models import User
from .security import hash_password
from .settings import settings


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    with SessionLocal() as db:
        user = db.scalar(select(User).where(User.email == settings.demo_email.lower()))
        if not user:
            db.add(User(email=settings.demo_email.lower(), password_hash=hash_password(settings.demo_password)))
            db.commit()
    yield


app = FastAPI(title="CodePilot API", version="1.0.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins, allow_credentials=True, allow_methods=["*"], allow_headers=["*"])
app.include_router(router)


@app.get("/health")
def health():
    return {"status": "ok", "service": "codepilot-api", "version": "1.0.0"}


@app.get("/ready")
def ready():
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return {"status": "ready"}
    except Exception as exc:
        return {"status": "not_ready", "reason": str(exc)}
