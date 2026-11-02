from __future__ import annotations

import json
import traceback
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from .database import SessionLocal
from .agents import DeliveryAgent, RepairAgent, RetrievalAgent, ReviewAgent, TestAgent, TriageAgent
from .models import Run, RunEvent
from .repository import changed_files, create_fix_commit, git_diff, prepare_workspace
from .rewards import record_reward


def _json(value: object) -> str:
    return json.dumps(value, ensure_ascii=False)


def _event(db: Session, run: Run, stage: str, status: str, message: str, details: dict | None = None) -> None:
    run.stage = stage
    db.add(RunEvent(run_id=run.id, stage=stage, status=status, message=message, details_json=_json(details) if details else None))
    db.commit()


def execute_run(run_id: int) -> None:
    db = SessionLocal()
    try:
        run = db.get(Run, run_id)
        if not run:
            return
        if run.status not in {"queued", "claimed"}:
            return
        run.status = "running"
        run.started_at = datetime.now(timezone.utc)
        db.commit()
        project = run.project
        triage_agent = TriageAgent()
        retrieval_agent = RetrievalAgent()
        test_agent = TestAgent()
        repair_agent = RepairAgent()
        review_agent = ReviewAgent()
        delivery_agent = DeliveryAgent()

        _event(db, run, "triage", "running", "Interpreting defect intent and constraints")
        triage = triage_agent.run(run.bug_report)
        _event(db, run, "triage", "completed", "Bug report triage completed", triage)

        _event(db, run, "workspace", "running", "Preparing isolated repository workspace")
        workspace = prepare_workspace(run.id, project.repo_url, project.is_demo)
        _event(db, run, "workspace", "completed", "Repository workspace ready", {"path": workspace.name})

        _event(db, run, "indexing", "running", "Parsing and embedding repository code")
        chunks = retrieval_agent.index(workspace)
        if not chunks:
            raise RuntimeError("No supported source files found in repository")
        _event(db, run, "indexing", "completed", f"Indexed {len(chunks)} code chunks", {"chunks": len(chunks)})

        _event(db, run, "baseline_tests", "running", "Running baseline test suite to reproduce the defect")
        baseline = test_agent.run(workspace)
        run.baseline_test_json = _json(baseline)
        db.commit()
        _event(db, run, "baseline_tests", "completed", "Baseline tests captured", {"passed": baseline["passed"], "exit_code": baseline["exit_code"]})

        query = run.bug_report + "\n\nTest evidence:\n" + baseline.get("output", "")[-6000:]
        _event(db, run, "retrieval", "running", "Retrieving repository context relevant to the report")
        contexts = retrieval_agent.run(chunks, query, limit=8)
        run.retrieval_json = _json(contexts)
        db.commit()
        _event(db, run, "retrieval", "completed", "Relevant code context ranked", {"top_files": list(dict.fromkeys(c["path"] for c in contexts))[:5]})

        _event(db, run, "patch", "running", "Generating and applying a constrained repair")
        patch = repair_agent.run(workspace, run.bug_report, contexts, baseline.get("output", ""))
        run.patch_json = _json(patch.as_dict())
        diff = git_diff(workspace)
        files = changed_files(workspace)
        run.diff_text = diff
        db.commit()
        _event(db, run, "patch", "completed", f"Applied {len(patch.edits)} targeted edit(s)", {"strategy": patch.strategy, "files": files})

        _event(db, run, "verification_tests", "running", "Running verification test suite after repair")
        verification = test_agent.run(workspace)
        run.verification_test_json = _json(verification)
        db.commit()
        _event(db, run, "verification_tests", "completed", "Verification tests finished", {"passed": verification["passed"], "exit_code": verification["exit_code"]})

        _event(db, run, "review", "running", "Reviewing diff, test evidence, scope and security signals")
        review = review_agent.run(diff, files, verification)
        reward = record_reward(patch.strategy, not baseline["passed"], verification["passed"], review["decision"] == "approved_for_human_review")
        review["learning_signal"] = reward
        run.review_json = _json(review)
        db.commit()
        _event(db, run, "review", "completed", f"Review decision: {review['decision']}", {"score": review["score"], "reward": reward["reward"]})

        if review["decision"] != "approved_for_human_review":
            run.status = "needs_attention"
            run.completed_at = datetime.now(timezone.utc)
            db.commit()
            _event(db, run, "complete", "blocked", "Patch requires human attention before PR preparation")
            return

        _event(db, run, "git", "running", "Creating fix branch and validated commit")
        branch = create_fix_commit(workspace, run.id)
        run.branch_name = branch
        db.commit()
        _event(db, run, "git", "completed", "Validated change committed", {"branch": branch})

        preview = delivery_agent.run(run.id, run.bug_report, patch.as_dict(), verification, review, files, branch)
        run.pr_preview_json = _json(preview)
        run.status = "completed"
        run.stage = "complete"
        run.completed_at = datetime.now(timezone.utc)
        db.commit()
        _event(db, run, "complete", "completed", "Pull-request-ready change prepared for human approval", {"ready": True})
    except Exception as exc:
        db.rollback()
        run = db.get(Run, run_id)
        if run:
            run.status = "failed"
            run.stage = "failed"
            run.error_message = str(exc)[:4000]
            run.completed_at = datetime.now(timezone.utc)
            db.add(RunEvent(run_id=run.id, stage="failed", status="failed", message=str(exc)[:1200], details_json=_json({"trace": traceback.format_exc()[-5000:]})))
            db.commit()
    finally:
        db.close()
