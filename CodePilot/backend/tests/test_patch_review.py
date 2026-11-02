import shutil
from pathlib import Path

from app.indexer import build_index
from app.patching import generate_and_apply_patch
from app.repository import ensure_git_baseline, git_diff, changed_files
from app.retrieval import retrieve
from app.review import review_change
from app.test_runner import run_tests

BUG = "Loyal customers should receive a discount at or above 100. At exactly 100 it currently fails."


def test_demo_repair_end_to_end(tmp_path):
    source = Path(__file__).resolve().parents[2] / "examples" / "demo_repo"
    root = tmp_path / "repo"
    shutil.copytree(source, root)
    ensure_git_baseline(root)

    baseline = run_tests(root)
    assert baseline["passed"] is False

    chunks = build_index(root)
    context = retrieve(chunks, BUG + "\n" + baseline["output"], limit=8)
    patch = generate_and_apply_patch(root, BUG, context, baseline["output"])
    assert patch.strategy == "inclusive-boundary"

    verification = run_tests(root)
    assert verification["passed"] is True

    diff = git_diff(root)
    assert ">= 100" in diff
    decision = review_change(diff, changed_files(root), verification)
    assert decision["decision"] == "approved_for_human_review"


def test_review_rejects_failed_verification():
    decision = review_change(
        "diff --git a/a.py b/a.py\n+print('x')\n",
        ["a.py"],
        {"passed": False},
    )
    assert decision["decision"] == "rejected"
    assert decision["blockers"]
