from __future__ import annotations

import shutil
import tempfile
import time
from pathlib import Path

from .indexer import build_index
from .patching import generate_and_apply_patch
from .repository import changed_files, ensure_git_baseline, git_diff
from .retrieval import retrieve
from .review import review_change
from .test_runner import run_tests

ROOT = Path(__file__).resolve().parents[2]
CASES = [
    (ROOT / "examples" / "demo_repo", "Loyalty threshold", "Loyal customers receive 10% discount at or above 100. Exactly 100 must qualify."),
    (ROOT / "examples" / "benchmark_cases" / "min_age", "Minimum age", "Access is allowed at least age 18. Exactly 18 must be eligible."),
    (ROOT / "examples" / "benchmark_cases" / "max_retries", "Maximum retries", "Retries are allowed at or below 3 attempts. Exactly 3 must still be allowed."),
]


def run_case(source: Path, name: str, report: str) -> dict:
    started = time.monotonic()
    with tempfile.TemporaryDirectory(prefix="codepilot-bench-") as tmp:
        root = Path(tmp) / "repo"
        shutil.copytree(source, root)
        ensure_git_baseline(root)
        baseline = run_tests(root)
        chunks = build_index(root)
        context = retrieve(chunks, report + "\n" + baseline.get("output", ""), limit=8)
        patch = generate_and_apply_patch(root, report, context, baseline.get("output", ""))
        verification = run_tests(root)
        diff = git_diff(root)
        review = review_change(diff, changed_files(root), verification)
        return {
            "case": name,
            "baseline_reproduced": not baseline["passed"],
            "retrieval_hit": any("test" not in x["path"].lower() for x in context[:3]),
            "patch_strategy": patch.strategy,
            "verification_passed": verification["passed"],
            "review_approved": review["decision"] == "approved_for_human_review",
            "runtime_seconds": round(time.monotonic() - started, 3),
        }


def main() -> int:
    rows = [run_case(*case) for case in CASES]
    print("CodePilot controlled benchmark")
    print("=" * 88)
    print(f"{'Case':22} {'Base fail':10} {'Retrieve':10} {'Verify':10} {'Review':10} {'Seconds':8}")
    for row in rows:
        print(f"{row['case'][:22]:22} {str(row['baseline_reproduced']):10} {str(row['retrieval_hit']):10} {str(row['verification_passed']):10} {str(row['review_approved']):10} {row['runtime_seconds']:<8}")
    success = sum(1 for r in rows if all([r['baseline_reproduced'], r['retrieval_hit'], r['verification_passed'], r['review_approved']]))
    print("-" * 88)
    print(f"Successful controlled cases: {success}/{len(rows)} ({success/len(rows)*100:.0f}%)")
    return 0 if success == len(rows) else 1


if __name__ == "__main__":
    raise SystemExit(main())
