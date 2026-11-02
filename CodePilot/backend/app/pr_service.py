from __future__ import annotations

from pathlib import Path


def build_pr_preview(run_id: int, bug_report: str, patch: dict, verification: dict, review: dict, changed_files: list[str], branch: str) -> dict:
    rationale = patch.get("rationale", "Targeted defect repair")
    first_sentence = bug_report.strip().split(".")[0][:90]
    title = f"Fix: {first_sentence}" if first_sentence else f"Fix reported defect (run {run_id})"
    body = (
        "## Summary\n"
        f"{rationale}\n\n"
        "## Validation\n"
        f"- Test command: `{verification.get('command', 'n/a')}`\n"
        f"- Verification: {'PASS' if verification.get('passed') else 'FAIL'}\n"
        f"- Automated review: {review.get('decision', 'unknown')}\n"
        f"- Review score: {review.get('score', 0)}/100\n\n"
        "## Changed files\n"
        + "\n".join(f"- `{name}`" for name in changed_files)
        + "\n\nHuman approval is required before merge."
    )
    return {"title": title[:120], "body": body, "branch": branch, "changed_files": changed_files, "ready": review.get("decision") == "approved_for_human_review"}
