from __future__ import annotations

import json
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from .database import SessionLocal
from .models import Project, Run, RunEvent, User
from .pipeline import execute_run
from .schemas import LoginRequest, ProjectCreate, RunCreate
from .security import create_token, parse_token, verify_password
from .settings import settings

router = APIRouter(prefix="/api")
bearer = HTTPBearer(auto_error=False)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def current_user(credentials: HTTPAuthorizationCredentials | None = Depends(bearer), db: Session = Depends(get_db)) -> User:
    if not credentials:
        raise HTTPException(status_code=401, detail="Authentication required")
    user_id = parse_token(credentials.credentials)
    user = db.get(User, user_id) if user_id else None
    if not user:
        raise HTTPException(status_code=401, detail="Invalid or expired session")
    return user


def _loads(value: str | None, default):
    try:
        return json.loads(value) if value else default
    except Exception:
        return default


def project_dict(p: Project) -> dict:
    return {"id": p.id, "name": p.name, "repo_url": p.repo_url, "default_branch": p.default_branch, "is_demo": p.is_demo, "created_at": p.created_at.isoformat()}


def run_dict(r: Run, include_events: bool = True) -> dict:
    return {
        "id": r.id,
        "project_id": r.project_id,
        "bug_report": r.bug_report,
        "status": r.status,
        "stage": r.stage,
        "branch_name": r.branch_name,
        "baseline_test": _loads(r.baseline_test_json, None),
        "retrieval": _loads(r.retrieval_json, []),
        "patch": _loads(r.patch_json, None),
        "verification_test": _loads(r.verification_test_json, None),
        "review": _loads(r.review_json, None),
        "diff": r.diff_text or "",
        "pr_preview": _loads(r.pr_preview_json, None),
        "error_message": r.error_message,
        "created_at": r.created_at.isoformat(),
        "started_at": r.started_at.isoformat() if r.started_at else None,
        "completed_at": r.completed_at.isoformat() if r.completed_at else None,
        "events": [
            {"id": e.id, "stage": e.stage, "status": e.status, "message": e.message, "details": _loads(e.details_json, {}), "created_at": e.created_at.isoformat()}
            for e in r.events
        ] if include_events else [],
    }


@router.post("/auth/login")
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.email == payload.email.lower().strip()))
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    return {"access_token": create_token(user.id), "token_type": "bearer", "user": {"id": user.id, "email": user.email}}


@router.get("/me")
def me(user: User = Depends(current_user)):
    return {"id": user.id, "email": user.email}


@router.get("/projects")
def projects(user: User = Depends(current_user), db: Session = Depends(get_db)):
    rows = db.scalars(select(Project).where(Project.owner_id == user.id).order_by(Project.id.desc())).all()
    return [project_dict(x) for x in rows]


@router.post("/projects", status_code=201)
def create_project(payload: ProjectCreate, user: User = Depends(current_user), db: Session = Depends(get_db)):
    project = Project(owner_id=user.id, name=payload.name.strip(), repo_url=str(payload.repo_url), default_branch=payload.default_branch.strip(), is_demo=False)
    db.add(project); db.commit(); db.refresh(project)
    return project_dict(project)


@router.post("/demo/project")
def demo_project(user: User = Depends(current_user), db: Session = Depends(get_db)):
    project = db.scalar(select(Project).where(Project.owner_id == user.id, Project.is_demo.is_(True), Project.name == "Loyalty Service Boundary Demo"))
    if not project:
        project = Project(owner_id=user.id, name="Loyalty Service Boundary Demo", repo_url=None, default_branch="main", is_demo=True)
        db.add(project); db.commit(); db.refresh(project)
    return {**project_dict(project), "demo_bug_report": "Loyal customers should receive a 10% discount when the invoice subtotal is at or above 100. At exactly 100 the current implementation returns no discount. Fix the inclusive boundary without changing unrelated behavior."}


@router.post("/projects/{project_id}/runs", status_code=202)
def queue_run(project_id: int, payload: RunCreate, background_tasks: BackgroundTasks, user: User = Depends(current_user), db: Session = Depends(get_db)):
    project = db.get(Project, project_id)
    if not project or project.owner_id != user.id:
        raise HTTPException(status_code=404, detail="Project not found")
    run = Run(project_id=project.id, bug_report=payload.bug_report.strip(), status="queued", stage="queued")
    db.add(run); db.commit(); db.refresh(run)
    db.add(RunEvent(run_id=run.id, stage="queued", status="queued", message="Run queued for autonomous execution")); db.commit()
    if settings.inline_worker:
        background_tasks.add_task(execute_run, run.id)
    return run_dict(run)


@router.get("/projects/{project_id}/runs")
def list_runs(project_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    project = db.get(Project, project_id)
    if not project or project.owner_id != user.id:
        raise HTTPException(status_code=404, detail="Project not found")
    rows = db.scalars(select(Run).where(Run.project_id == project_id).order_by(Run.id.desc())).all()
    return [run_dict(r, include_events=False) for r in rows]


@router.get("/runs/{run_id}")
def get_run(run_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    run = db.get(Run, run_id)
    if not run or run.project.owner_id != user.id:
        raise HTTPException(status_code=404, detail="Run not found")
    return run_dict(run)
