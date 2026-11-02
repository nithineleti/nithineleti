# CodePilot

**CodePilot** is a repository-to-pull-request-preview software engineering platform for autonomous bug-resolution workflows. It accepts a Git repository and bug report, prepares a clean workspace, indexes and retrieves relevant code, reproduces the defect with automated tests, applies a constrained repair, re-runs validation, reviews the Git diff, learns from the outcome, and prepares a human-review-ready branch, commit, and pull request summary.

The product is vendor-neutral. No external inference provider is hard-coded into the UI, source code, or documentation. A deterministic offline repair engine is included so the complete semester demonstration works without paid credentials.

## Implemented features

- React + Vite responsive engineering dashboard.
- FastAPI REST API with OpenAPI/Swagger documentation.
- Password authentication with scrypt hashing and signed expiring bearer sessions.
- User-scoped repositories and run history.
- PostgreSQL production database with SQLite local fallback.
- Separate production worker plus optional inline local worker.
- Multi-agent orchestration: triage, retrieval, test, repair, review, and delivery roles.
- Python AST-aware source chunking and language-agnostic text chunking.
- Deterministic 384-dimensional hashed code/query embeddings.
- RAG-style cosine + lexical retrieval.
- Baseline and verification test execution.
- Constrained path-validated patch application.
- Offline boundary-condition repair strategy.
- Optional vendor-neutral inference HTTP gateway for broader repair strategies.
- UCB1 reward-learning policy for repair-strategy ranking.
- Git diff, fix branch, and validated commit creation.
- Review gate for tests, change scope, obvious secret leakage, and risky constructs.
- Pull-request-ready title/body/branch preview with mandatory human approval.
- Dockerfiles, Docker Compose, Nginx reverse proxy, health checks, and CI workflow.
- Unit/integration tests and a complete intentional-bug demo repository.
- SRS, architecture, API reference, security model, test plan, deployment guide, project report draft, viva Q&A, presentation outline, and semester submission checklist.

## Fastest proof: one-command demo

Prerequisites: Python 3.11+ and Git.

### Linux / macOS

```bash
./scripts/run_demo.sh
```

### Windows PowerShell

```powershell
.\scripts\run_demo.ps1
```

The demo proves this sequence:

```text
Bug report
  -> triage
  -> clean Git workspace
  -> code indexing
  -> baseline tests FAIL (defect reproduced)
  -> RAG retrieval
  -> constrained patch
  -> verification tests PASS
  -> automated review 100/100
  -> fix branch + commit
  -> PR preview for human approval
```

The captured successful output is included at `docs/DEMO_OUTPUT.txt`.

## Full local web application

### 1. Backend

```bash
python3 -m venv .venv
source .venv/bin/activate                  # Windows: .venv\Scripts\activate
pip install -e './backend[dev]'
cp .env.example .env                       # Windows: copy .env.example .env
PYTHONPATH=backend uvicorn app.main:app --reload --port 8000
```

Local development defaults to `INLINE_WORKER=true`, so queued runs execute from the API process.

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`.

Demo credentials are pre-filled on the login screen:

```text
demo@codepilot.local
DemoPass123!
```

Click **Load Demo Project**, then **Queue autonomous run**.

## Production-style Docker stack

Prerequisites: Docker Engine + Docker Compose.

```bash
cp .env.example .env
# Replace APP_SECRET and demo credentials before non-local use.
docker compose up --build
```

Open `http://localhost:8080`.

Docker Compose runs:

- `frontend`: Nginx + production React build
- `backend`: FastAPI API
- `worker`: dedicated run processor
- `db`: PostgreSQL 16

## API endpoints

With the backend running:

- Swagger UI: `http://localhost:8000/docs`
- OpenAPI JSON: `http://localhost:8000/openapi.json`
- Health: `http://localhost:8000/health`
- Readiness: `http://localhost:8000/ready`

See `docs/API.md` for the project routes.

## Run tests

```bash
PYTHONPATH=backend pytest -q backend/tests
```

The included test suite validates retrieval, defect repair, review gates, authentication/demo APIs, and the end-to-end fail -> fix -> pass pipeline.

## Included demo defect

Business rule: loyal customers receive 10% off when subtotal is **at least 100**.

Intentional implementation:

```python
if loyal_customer and subtotal > 100:
```

Validated repair:

```python
if loyal_customer and subtotal >= 100:
```

The baseline suite fails at exactly `100`; the verification suite passes after the repair.

## Important production security boundary

Repository tests execute repository code. Treat untrusted repositories as hostile. The local runner is appropriate for trusted classroom/demo repositories. A public multi-tenant deployment must execute each run inside a dedicated ephemeral sandbox/VM/container with no secrets, strict CPU/memory/time/network limits, and restricted filesystem access. See `docs/SECURITY.md`.

## Semester submission

Start with `docs/COLLEGE_SUBMISSION_CHECKLIST.md`. The package already contains the core written material you can adapt to your university template. College-specific certificate pages, supervisor signatures, student names/roll numbers, originality forms, and final screenshots must be supplied according to your department rules.
