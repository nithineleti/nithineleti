from __future__ import annotations

import os
import shutil
import subprocess
from pathlib import Path
from urllib.parse import urlparse

from .settings import settings

IGNORE_DIRS = {".git", "node_modules", ".venv", "venv", "dist", "build", "__pycache__", ".pytest_cache", "coverage"}


def _run(cmd: list[str], cwd: Path | None = None, timeout: int = 60) -> subprocess.CompletedProcess[str]:
    return subprocess.run(cmd, cwd=cwd, text=True, capture_output=True, timeout=timeout, check=False)


def repo_size_mb(root: Path) -> float:
    total = 0
    for path in root.rglob("*"):
        if path.is_dir() and path.name in IGNORE_DIRS:
            continue
        if path.is_file():
            try:
                total += path.stat().st_size
            except OSError:
                pass
    return total / (1024 * 1024)


def validate_remote_url(url: str) -> None:
    parsed = urlparse(url)
    if parsed.scheme not in {"https", "http"} or not parsed.netloc:
        raise ValueError("Repository URL must be an http(s) URL")
    if parsed.hostname in {"localhost", "127.0.0.1", "0.0.0.0"}:
        raise ValueError("Local network repository URLs are not allowed")


def prepare_workspace(run_id: int, repo_url: str | None, is_demo: bool) -> Path:
    workspace = settings.workspace_root / f"run-{run_id}"
    if workspace.exists():
        shutil.rmtree(workspace)
    workspace.parent.mkdir(parents=True, exist_ok=True)

    if is_demo:
        source = Path(__file__).resolve().parents[2] / "examples" / "demo_repo"
        if not source.exists():
            raise FileNotFoundError(f"Demo repository missing: {source}")
        shutil.copytree(source, workspace)
    else:
        if not repo_url:
            raise ValueError("Project has no repository URL")
        validate_remote_url(repo_url)
        result = _run(["git", "clone", "--depth", "1", repo_url, str(workspace)], timeout=90)
        if result.returncode != 0:
            raise RuntimeError(f"Repository clone failed: {result.stderr[-1200:]}")

    if repo_size_mb(workspace) > settings.max_repo_mb:
        shutil.rmtree(workspace, ignore_errors=True)
        raise ValueError(f"Repository exceeds {settings.max_repo_mb} MB limit")

    ensure_git_baseline(workspace)
    return workspace


def ensure_git_baseline(workspace: Path) -> None:
    if not (workspace / ".git").exists():
        _run(["git", "init"], cwd=workspace)
        _run(["git", "config", "user.email", "codepilot@local"], cwd=workspace)
        _run(["git", "config", "user.name", "CodePilot"], cwd=workspace)
        _run(["git", "add", "."], cwd=workspace)
        _run(["git", "commit", "-m", "Baseline snapshot"], cwd=workspace)
    else:
        _run(["git", "config", "user.email", "codepilot@local"], cwd=workspace)
        _run(["git", "config", "user.name", "CodePilot"], cwd=workspace)


def create_fix_commit(workspace: Path, run_id: int) -> str:
    branch = f"codepilot/fix-run-{run_id}"
    current = _run(["git", "rev-parse", "--abbrev-ref", "HEAD"], cwd=workspace)
    if current.returncode != 0:
        branch = f"fix-run-{run_id}"
    checkout = _run(["git", "checkout", "-b", branch], cwd=workspace)
    if checkout.returncode != 0:
        _run(["git", "checkout", branch], cwd=workspace)
    _run(["git", "add", "."], cwd=workspace)
    diff_cached = _run(["git", "diff", "--cached", "--quiet"], cwd=workspace)
    if diff_cached.returncode != 0:
        commit = _run(["git", "commit", "-m", f"fix: resolve reported defect (run {run_id})"], cwd=workspace)
        if commit.returncode != 0:
            raise RuntimeError(commit.stderr[-1000:])
    return branch


def git_diff(workspace: Path) -> str:
    result = _run(["git", "diff", "--", "."], cwd=workspace)
    if result.returncode != 0:
        raise RuntimeError(result.stderr[-1000:])
    return result.stdout


def changed_files(workspace: Path) -> list[str]:
    result = _run(["git", "diff", "--name-only"], cwd=workspace)
    return [x.strip() for x in result.stdout.splitlines() if x.strip()]
