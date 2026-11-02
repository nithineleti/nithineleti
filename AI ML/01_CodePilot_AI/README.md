# CodePilot AI — Autonomous Software Engineering Agent

A runnable portfolio project that demonstrates a complete bug-resolution loop: **bug report → repository retrieval → patch → automated tests → human-review diff**. The default demo is fully local and does not need an API key.

## Quick start
```bash
./run.sh
# open http://localhost:8000
```
Or with Docker: `docker compose up --build`.

## Demo story
Use the pre-filled report: **“Checkout rejects a valid 100% discount coupon.”** The bundled sample repository intentionally contains that bug. CodePilot ranks relevant files, patches the boundary condition, runs the failing tests, then runs them again in a temporary sandbox and returns a validated diff.

## Architecture
Browser UI → FastAPI → TF-IDF code retrieval → deterministic patch planner → temporary repo sandbox → pytest validator → review response.

## What makes it interview-worthy
This is not a chat UI. It demonstrates retrieval, agent stages, software tooling, validation, failure handling, API design, testing, Docker and CI. A provider-neutral LLM adapter is included for future natural-language planning.

See `DEMO_GUIDE.md`, `PRESENTATION_SCRIPT.md`, `ARCHITECTURE.md`, `INTERVIEW_QA.md`, and `RESUME_POINTS.md`.
