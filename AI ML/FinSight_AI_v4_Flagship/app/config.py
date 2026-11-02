from functools import lru_cache
from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parents[1]


class Settings(BaseSettings):
    app_name: str = "FinSight AI"
    app_env: str = "development"
    api_prefix: str = "/api/v1"
    database_url: str = f"sqlite:///{BASE_DIR / 'runtime' / 'finsight.db'}"
    secret_key: str = "development-only-secret-change-before-production-1234"
    access_token_minutes: int = 120
    cors_origins: str = "http://localhost:8000,http://127.0.0.1:8000"
    max_upload_mb: int = 20
    rate_limit_per_minute: int = 180
    demo_email: str = "demo@finsight.ai"
    demo_password: str = "DemoPass123!"

    # Retrieval stack.
    retrieval_mode: str = "hybrid"
    embedding_backend: str = "local_hashing"  # local_hashing | sentence_transformers
    embedding_model: str = "sentence-transformers/all-MiniLM-L6-v2"
    embedding_dimension: int = 384
    reranker_backend: str = "feature"  # feature | cross_encoder
    reranker_model: str = "cross-encoder/ms-marco-MiniLM-L-6-v2"
    dense_weight: float = 0.42
    bm25_weight: float = 0.33
    rerank_weight: float = 0.20
    graph_weight: float = 0.05
    retrieval_candidate_k: int = 40

    # Grounded generation. Offline extractive is safe default.
    generator_backend: str = "extractive"  # extractive | ollama | chat_completions
    llm_base_url: str = "http://127.0.0.1:11434"
    llm_model: str = "llama3.2:3b"
    llm_api_key: str = ""
    llm_timeout_seconds: int = 45
    enforce_citations: bool = True
    prompt_injection_guard: bool = True

    # Optional integrations.
    redis_url: str = ""
    s3_bucket: str = ""
    s3_endpoint_url: str = ""
    aws_region: str = "us-east-1"
    sec_user_agent: str = "FinSightAI demo@example.com"
    finbert_enabled: bool = False
    finbert_model: str = "ProsusAI/finbert"
    ocr_enabled: bool = False
    enable_live_news: bool = False
    news_api_url: str = ""
    news_api_key: str = ""

    # Production/worker knobs.
    background_jobs_backend: str = "inline"  # inline | celery
    celery_broker_url: str = ""
    celery_result_backend: str = ""
    report_output_dir: str = str(BASE_DIR / "runtime" / "reports")
    audit_retention_days: int = 90

    model_config = SettingsConfigDict(env_file=".env", extra="ignore", case_sensitive=False)

    @property
    def cors_origin_list(self) -> list[str]:
        return [x.strip() for x in self.cors_origins.split(",") if x.strip()]

    @property
    def is_postgres(self) -> bool:
        return self.database_url.startswith("postgresql")


@lru_cache
def get_settings() -> Settings:
    return Settings()
