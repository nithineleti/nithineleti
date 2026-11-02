import os
from pathlib import Path
import pytest

TEST_DB = Path(__file__).resolve().parent / "test_finsight.db"
if TEST_DB.exists():
    TEST_DB.unlink()
os.environ["DATABASE_URL"] = f"sqlite:///{TEST_DB}"
os.environ["SECRET_KEY"] = "test-secret-that-is-definitely-long-enough-123456"
os.environ["APP_ENV"] = "test"
os.environ["EMBEDDING_BACKEND"] = "local_hashing"
os.environ["RERANKER_BACKEND"] = "feature"
os.environ["GENERATOR_BACKEND"] = "extractive"

from app.config import get_settings
get_settings.cache_clear()
from app.main import app
from fastapi.testclient import TestClient


@pytest.fixture(scope="session", autouse=True)
def clean_db():
    yield
    if TEST_DB.exists():
        TEST_DB.unlink()


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def auth(client):
    r = client.post("/api/v1/auth/login", json={"email":"demo@finsight.ai","password":"DemoPass123!"})
    assert r.status_code == 200
    return {"Authorization": "Bearer " + r.json()["access_token"]}
