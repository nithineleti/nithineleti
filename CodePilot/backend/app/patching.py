from __future__ import annotations

import json
import re
import urllib.request
from dataclasses import dataclass
from pathlib import Path

from .settings import settings
from .rewards import rank_strategies


@dataclass
class PatchResult:
    strategy: str
    edits: list[dict]
    rationale: str

    def as_dict(self) -> dict:
        return {"strategy": self.strategy, "edits": self.edits, "rationale": self.rationale}


def _safe_path(root: Path, relative: str) -> Path:
    candidate = (root / relative).resolve()
    root_resolved = root.resolve()
    if root_resolved != candidate and root_resolved not in candidate.parents:
        raise ValueError("Patch path escapes repository workspace")
    return candidate


def _apply_edits(root: Path, edits: list[dict]) -> list[dict]:
    applied: list[dict] = []
    for edit in edits:
        rel = str(edit.get("path", ""))
        search = str(edit.get("search", ""))
        replace = str(edit.get("replace", ""))
        if not rel or not search or search == replace:
            continue
        path = _safe_path(root, rel)
        if not path.is_file() or any(part in {".git", "node_modules", ".venv"} for part in path.parts):
            continue
        text = path.read_text(encoding="utf-8")
        if search not in text:
            continue
        count = text.count(search)
        if count != 1:
            continue
        path.write_text(text.replace(search, replace, 1), encoding="utf-8")
        applied.append({"path": rel, "search": search, "replace": replace})
    return applied


def _threshold_repair(root: Path, bug_report: str, contexts: list[dict]) -> PatchResult | None:
    lower = bug_report.lower()
    inclusive_up = any(p in lower for p in ["at or above", "at least", "greater than or equal", "minimum", "exactly"])
    inclusive_down = any(p in lower for p in ["at or below", "at most", "less than or equal", "maximum"])
    numbers = re.findall(r"(?<![\w.])\d+(?:\.\d+)?", bug_report)
    if not numbers or not (inclusive_up or inclusive_down):
        return None

    preferred = [c.get("path", "") for c in contexts]
    candidates = preferred + [p.relative_to(root).as_posix() for p in root.rglob("*.py")]
    seen: set[str] = set()
    for rel in candidates:
        if rel in seen or not rel or "test" in Path(rel).name.lower():
            continue
        seen.add(rel)
        path = _safe_path(root, rel)
        if not path.exists() or path.suffix not in {".py", ".js", ".ts", ".tsx", ".jsx", ".java", ".go", ".rb", ".php", ".cs"}:
            continue
        text = path.read_text(encoding="utf-8")
        for number in numbers:
            if inclusive_up:
                pattern = re.compile(rf"(?<![<>=!])>\s*{re.escape(number)}(?![\d.])")
                match = pattern.search(text)
                if match:
                    search = match.group(0)
                    replace = search.replace(">", ">=", 1)
                    applied = _apply_edits(root, [{"path": rel, "search": search, "replace": replace}])
                    if applied:
                        return PatchResult("inclusive-boundary", applied, f"The report describes an inclusive lower boundary at {number}; the implementation used an exclusive comparison.")
            if inclusive_down:
                pattern = re.compile(rf"(?<![<>=!])<\s*{re.escape(number)}(?![\d.])")
                match = pattern.search(text)
                if match:
                    search = match.group(0)
                    replace = search.replace("<", "<=", 1)
                    applied = _apply_edits(root, [{"path": rel, "search": search, "replace": replace}])
                    if applied:
                        return PatchResult("inclusive-boundary", applied, f"The report describes an inclusive upper boundary at {number}; the implementation used an exclusive comparison.")
    return None


def _remote_inference(root: Path, bug_report: str, contexts: list[dict], test_output: str) -> PatchResult | None:
    if not settings.inference_url:
        return None
    payload = json.dumps({"bug_report": bug_report, "context": contexts[:6], "test_output": test_output[-6000:]}).encode()
    headers = {"Content-Type": "application/json"}
    if settings.inference_token:
        headers["Authorization"] = f"Bearer {settings.inference_token}"
    request = urllib.request.Request(settings.inference_url, data=payload, headers=headers, method="POST")
    with urllib.request.urlopen(request, timeout=45) as response:
        data = json.loads(response.read().decode())
    edits = _apply_edits(root, data.get("edits", []))
    if not edits:
        return None
    return PatchResult("inference-gateway", edits, str(data.get("rationale", "Patch generated from configured inference service.")))


def generate_and_apply_patch(root: Path, bug_report: str, contexts: list[dict], test_output: str) -> PatchResult:
    available = ["inclusive-boundary"]
    if settings.inference_url:
        available.append("inference-gateway")
    failures: list[str] = []
    for strategy in rank_strategies(available):
        try:
            if strategy == "inclusive-boundary":
                result = _threshold_repair(root, bug_report, contexts)
            else:
                result = _remote_inference(root, bug_report, contexts, test_output)
            if result:
                return result
        except Exception as exc:
            failures.append(f"{strategy}: {exc}")
    suffix = f" Details: {'; '.join(failures)}" if failures else ""
    raise RuntimeError("No safe repair strategy produced an applicable patch." + suffix)
