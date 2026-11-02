from __future__ import annotations

import re
from pathlib import Path

from .settings import settings

SECRET_PATTERNS = [
    re.compile(r"(?i)(api[_-]?key|secret|token|password)\s*[:=]\s*['\"][^'\"]{8,}['\"]"),
    re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"),
]
RISK_PATTERNS = [
    ("dynamic-eval", re.compile(r"\beval\s*\(")),
    ("dynamic-exec", re.compile(r"\bexec\s*\(")),
    ("shell-execution", re.compile(r"shell\s*=\s*True")),
]


def review_change(diff_text: str, changed_files: list[str], verification: dict) -> dict:
    blockers: list[str] = []
    warnings: list[str] = []
    if not verification.get("passed"):
        blockers.append("Verification test suite is not passing")
    if not diff_text.strip():
        blockers.append("Patch produced no source diff")
    if len(changed_files) > settings.max_changed_files:
        blockers.append(f"Patch changes {len(changed_files)} files; limit is {settings.max_changed_files}")

    added = "\n".join(line[1:] for line in diff_text.splitlines() if line.startswith("+") and not line.startswith("+++"))
    for pattern in SECRET_PATTERNS:
        if pattern.search(added):
            blockers.append("Possible credential or secret introduced in patch")
            break
    for label, pattern in RISK_PATTERNS:
        if pattern.search(added):
            warnings.append(f"Review added {label} usage before merge")

    score = 100
    score -= 40 * len(blockers)
    score -= 8 * len(warnings)
    score -= max(0, len(changed_files) - 2) * 3
    return {
        "decision": "approved_for_human_review" if not blockers else "rejected",
        "score": max(0, score),
        "blockers": blockers,
        "warnings": warnings,
        "checks": {
            "verification_passed": bool(verification.get("passed")),
            "diff_present": bool(diff_text.strip()),
            "changed_file_count": len(changed_files),
            "changed_file_limit": settings.max_changed_files,
            "secret_scan": "passed" if not any("secret" in x.lower() for x in blockers) else "failed",
        },
    }
