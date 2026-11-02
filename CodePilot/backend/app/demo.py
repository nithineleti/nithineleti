from __future__ import annotations

import json
from sqlalchemy import select

from .database import SessionLocal, init_db
from .models import Project, Run, User
from .pipeline import execute_run
from .security import hash_password
from .settings import settings

BUG = "Loyal customers should receive a 10% discount when the invoice subtotal is at or above 100. At exactly 100 the current implementation returns no discount. Fix the inclusive boundary without changing unrelated behavior."


def main() -> int:
    init_db()
    with SessionLocal() as db:
        user = db.scalar(select(User).where(User.email == settings.demo_email))
        if not user:
            user = User(email=settings.demo_email, password_hash=hash_password(settings.demo_password)); db.add(user); db.commit(); db.refresh(user)
        project = Project(owner_id=user.id, name="CLI Demo", is_demo=True, default_branch="main"); db.add(project); db.commit(); db.refresh(project)
        run = Run(project_id=project.id, bug_report=BUG, status="queued", stage="queued"); db.add(run); db.commit(); db.refresh(run)
        run_id = run.id
    execute_run(run_id)
    with SessionLocal() as db:
        run = db.get(Run, run_id)
        def loads(v): return json.loads(v) if v else None
        print("\n=== CodePilot Autonomous Demo ===")
        print(f"Run: {run.id} | Status: {run.status}")
        baseline = loads(run.baseline_test_json); verification = loads(run.verification_test_json); review = loads(run.review_json); patch = loads(run.patch_json); pr = loads(run.pr_preview_json)
        print(f"Baseline tests: {'PASS' if baseline and baseline['passed'] else 'FAIL (defect reproduced)'}")
        print(f"Patch strategy: {patch['strategy'] if patch else 'n/a'}")
        print(f"Verification tests: {'PASS' if verification and verification['passed'] else 'FAIL'}")
        print(f"Review: {review['decision'] if review else 'n/a'} | Score: {review['score'] if review else 0}/100")
        print("\nDiff:\n" + (run.diff_text or "<none>"))
        print("PR preview:\n" + json.dumps(pr, indent=2))
        return 0 if run.status == "completed" else 1


if __name__ == "__main__":
    raise SystemExit(main())
