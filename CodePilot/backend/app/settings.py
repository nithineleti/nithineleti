from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path


def _bool(name: str, default: bool) -> bool:
    value = os.getenv(name)
    return default if value is None else value.strip().lower() in {"1", "true", "yes", "on"}


def _int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, str(default)))
    except ValueError:
        return default


def _origins() -> list[str]:
    return [x.strip() for x in os.getenv("CORS_ORIGINS", "http://localhost:5173,http://localhost:8080").split(",") if x.strip()]


@dataclass(frozen=True)
class Settings:
    app_env: str = field(default_factory=lambda: os.getenv("APP_ENV", "development"))
    app_secret: str = field(default_factory=lambda: os.getenv("APP_SECRET", "development-only-change-me"))
    database_url: str = field(default_factory=lambda: os.getenv("DATABASE_URL", "sqlite:///./data/codepilot.db"))
    workspace_root: Path = field(default_factory=lambda: Path(os.getenv("WORKSPACE_ROOT", "./workspaces")).resolve())
    inline_worker: bool = field(default_factory=lambda: _bool("INLINE_WORKER", True))
    cors_origins: list[str] = field(default_factory=_origins)
    demo_email: str = field(default_factory=lambda: os.getenv("DEMO_EMAIL", "demo@codepilot.local"))
    demo_password: str = field(default_factory=lambda: os.getenv("DEMO_PASSWORD", "DemoPass123!"))
    run_timeout_seconds: int = field(default_factory=lambda: _int("RUN_TIMEOUT_SECONDS", 120))
    max_repo_mb: int = field(default_factory=lambda: _int("MAX_REPO_MB", 100))
    max_changed_files: int = field(default_factory=lambda: _int("MAX_CHANGED_FILES", 8))
    inference_url: str = field(default_factory=lambda: os.getenv("INFERENCE_URL", "").strip())
    inference_token: str = field(default_factory=lambda: os.getenv("INFERENCE_TOKEN", "").strip())
    git_host_token: str = field(default_factory=lambda: os.getenv("GIT_HOST_TOKEN", "").strip())


settings = Settings()
settings.workspace_root.mkdir(parents=True, exist_ok=True)
