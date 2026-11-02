from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path

from .indexer import build_index
from .patching import PatchResult, generate_and_apply_patch
from .pr_service import build_pr_preview
from .retrieval import retrieve
from .review import review_change
from .test_runner import run_tests


@dataclass(frozen=True)
class AgentIdentity:
    name: str
    responsibility: str


class TriageAgent:
    identity = AgentIdentity("triage", "Extract defect intent, constraints and boundary values")

    def run(self, bug_report: str) -> dict:
        lower = bug_report.lower()
        return {
            "intent": "bug_resolution",
            "thresholds": re.findall(r"(?<![\w.])\d+(?:\.\d+)?", bug_report),
            "inclusive_boundary": any(p in lower for p in ["at or above", "at least", "at or below", "at most", "exactly"]),
            "mentions_regression_scope": any(p in lower for p in ["unrelated", "regression", "existing behavior", "existing behaviour"]),
        }


class RetrievalAgent:
    identity = AgentIdentity("retrieval", "Index repository code and rank relevant context")

    def index(self, workspace: Path):
        return build_index(workspace)

    def run(self, chunks, query: str, limit: int = 8) -> list[dict]:
        return retrieve(chunks, query, limit=limit)


class TestAgent:
    identity = AgentIdentity("validation", "Run baseline and verification test evidence")

    def run(self, workspace: Path) -> dict:
        return run_tests(workspace)


class RepairAgent:
    identity = AgentIdentity("repair", "Generate and apply constrained repository edits")

    def run(self, workspace: Path, bug_report: str, contexts: list[dict], test_output: str) -> PatchResult:
        return generate_and_apply_patch(workspace, bug_report, contexts, test_output)


class ReviewAgent:
    identity = AgentIdentity("review", "Evaluate tests, diff scope and safety signals")

    def run(self, diff_text: str, changed_files: list[str], verification: dict) -> dict:
        return review_change(diff_text, changed_files, verification)


class DeliveryAgent:
    identity = AgentIdentity("delivery", "Prepare human-review-ready pull request metadata")

    def run(self, run_id: int, bug_report: str, patch: dict, verification: dict, review: dict, changed_files: list[str], branch: str) -> dict:
        return build_pr_preview(run_id, bug_report, patch, verification, review, changed_files, branch)
