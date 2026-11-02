import os
from pathlib import Path

os.environ.setdefault("DATABASE_URL", "sqlite:///./data/test_codepilot.db")
os.environ.setdefault("INLINE_WORKER", "false")

from fastapi.testclient import TestClient

from app.main import app
from app.settings import settings


def test_health_and_demo_login():
    with TestClient(app) as client:
        assert client.get("/health").status_code == 200
        response = client.post("/api/auth/login", json={"email": settings.demo_email, "password": settings.demo_password})
        assert response.status_code == 200
        token = response.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}
        demo = client.post("/api/demo/project", headers=headers)
        assert demo.status_code == 200
        assert demo.json()["is_demo"] is True
