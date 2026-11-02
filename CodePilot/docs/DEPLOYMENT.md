# Deployment Guide

## Local semester demo

For the simplest live demonstration use SQLite and inline execution:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -e './backend[dev]'
PYTHONPATH=backend uvicorn app.main:app --reload --port 8000
```

In another terminal:

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`.

## Production-style Docker Compose

```bash
cp .env.example .env
docker compose up --build
```

Services:

- `frontend`: Nginx + production React bundle
- `backend`: FastAPI HTTP service
- `worker`: dedicated autonomous-run process
- `db`: PostgreSQL 16

Open `http://localhost:8080`.

## Environment variables

Use `.env.example` as the source of truth.

Important settings:

- `APP_ENV`
- `APP_SECRET`
- `DATABASE_URL`
- `WORKSPACE_ROOT`
- `INLINE_WORKER`
- `CORS_ORIGINS`
- `DEMO_EMAIL`
- `DEMO_PASSWORD`
- `RUN_TIMEOUT_SECONDS`
- `MAX_REPO_MB`
- `MAX_CHANGED_FILES`
- `INFERENCE_URL` (optional vendor-neutral repair service)
- `INFERENCE_TOKEN` (optional)

## Production checklist

1. Replace all default secrets and demo credentials.
2. Use managed PostgreSQL with backups.
3. Terminate TLS at a trusted load balancer/reverse proxy.
4. Restrict CORS to the real frontend origin.
5. Disable/remove the demo account if not needed.
6. Execute external repositories in ephemeral sandbox infrastructure.
7. Keep inference credentials only on worker hosts.
8. Add centralized logs, metrics and alerting.
9. Apply API gateway/reverse-proxy rate limits.
10. Apply dependency and container vulnerability scanning.
11. Keep base images and dependencies patched.
12. Run backend tests and frontend production build in CI before release.

## Health checks

- `/health`: API process is alive.
- `/ready`: API can query its configured database.
- `/healthz`: Nginx frontend container is alive.
