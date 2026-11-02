from __future__ import annotations

import json
import os
import subprocess
import sys
import time
from pathlib import Path

from .settings import settings


def detect_test_command(root: Path) -> list[str]:
    tests_dir = root / "tests"
    has_python_tests = (root / "pytest.ini").exists()
    if tests_dir.exists():
        has_python_tests = has_python_tests or any(tests_dir.rglob("test_*.py"))
    pyproject = root / "pyproject.toml"
    if pyproject.exists():
        try:
            pyproject_text = pyproject.read_text(encoding="utf-8").lower()
            has_python_tests = has_python_tests or "pytest" in pyproject_text
        except OSError:
            pass
    if has_python_tests:
        return [sys.executable, "-m", "pytest", "-q"]
    package = root / "package.json"
    if package.exists():
        try:
            data = json.loads(package.read_text(encoding="utf-8"))
            if "test" in data.get("scripts", {}):
                return ["npm", "test", "--", "--run"]
        except Exception:
            pass
    raise RuntimeError("No supported automated test command detected")


def run_tests(root: Path) -> dict:
    command = detect_test_command(root)
    started = time.monotonic()
    env = os.environ.copy()
    env["PYTHONPATH"] = str(root) + os.pathsep + env.get("PYTHONPATH", "")
    try:
        proc = subprocess.run(
            command,
            cwd=root,
            env=env,
            text=True,
            capture_output=True,
            timeout=settings.run_timeout_seconds,
            check=False,
        )
        duration = time.monotonic() - started
        output = (proc.stdout + "\n" + proc.stderr).strip()
        display_command = "python -m pytest -q" if command[:3] == [sys.executable, "-m", "pytest"] else " ".join(command)
        return {
            "command": display_command,
            "exit_code": proc.returncode,
            "passed": proc.returncode == 0,
            "duration_seconds": round(duration, 3),
            "output": output[-12000:],
        }
    except subprocess.TimeoutExpired as exc:
        display_command = "python -m pytest -q" if command[:3] == [sys.executable, "-m", "pytest"] else " ".join(command)
        return {
            "command": display_command,
            "exit_code": 124,
            "passed": False,
            "duration_seconds": round(time.monotonic() - started, 3),
            "output": f"Test run timed out after {settings.run_timeout_seconds}s\n{(exc.stdout or '')[-4000:]}",
        }
