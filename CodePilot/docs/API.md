# API Reference

Interactive documentation is generated automatically at `/docs` while the FastAPI service is running.

## Authentication

### `POST /api/auth/login`

```json
{
  "email": "demo@codepilot.local",
  "password": "DemoPass123!"
}
```

Returns an expiring bearer token.

### `GET /api/me`
Returns the authenticated user.

## Projects

### `GET /api/projects`
Lists repositories/projects owned by the current user.

### `POST /api/projects`
Registers a remote HTTP(S) Git repository.

```json
{
  "name": "Payment Service",
  "repo_url": "https://code-host.example/team/payment-service.git",
  "default_branch": "main"
}
```

### `POST /api/demo/project`
Creates or returns the included controlled demonstration project and its pre-written bug report.

## Runs

### `POST /api/projects/{project_id}/runs`
Queues a bug-resolution run.

```json
{
  "bug_report": "At exactly 100 the loyalty discount is not applied. It should apply at or above 100."
}
```

### `GET /api/projects/{project_id}/runs`
Returns run history for a project.

### `GET /api/runs/{run_id}`
Returns the complete evidence object: status, stage, events, baseline tests, retrieved code, patch metadata, verification tests, review, Git diff, branch, and PR preview.

## Service health

### `GET /health`
Process liveness.

### `GET /ready`
Database readiness.

## Pull-request delivery

Version 1.0 creates a local fix branch/commit plus a **pull-request preview**. It deliberately does not push or merge remote code. This keeps the semester demo safe and preserves human control. A production code-host connector can be added as a future extension after repository-specific authentication and approval controls are designed.
