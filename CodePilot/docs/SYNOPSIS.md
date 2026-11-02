# Project Synopsis

## Title
**CodePilot: Autonomous Software Engineering Agent for Repository-Level Bug Resolution**

## Problem
Developers spend substantial time moving from bug report to validated change: understanding the issue, searching an unfamiliar repository, reproducing the failure, editing code, running tests, reviewing scope and preparing a pull request.

## Proposed solution
CodePilot converts this sequence into a traceable autonomous pipeline. It combines natural-language triage, repository code retrieval, constrained repair, test validation, review gates, learning signals and Git delivery evidence. Human approval remains mandatory before merge.

## Core objectives

1. Understand natural-language bug reports.
2. Locate relevant source code using RAG-style retrieval.
3. Reproduce defects using baseline tests.
4. Generate minimal controlled edits.
5. Verify repairs using automated tests.
6. Review patch scope and safety signals.
7. Learn from repair outcomes.
8. Prepare Git/PR evidence for a human reviewer.

## Major modules

- Authentication and project management
- Repository workspace manager
- Triage agent
- Code indexer and embeddings
- Retrieval agent
- Validation/test agent
- Repair agent
- Review gate
- Reward-learning policy
- Git/delivery agent
- React dashboard
- PostgreSQL persistence
- Docker/Nginx deployment

## Technology stack
Python, FastAPI, SQLAlchemy, React, Vite, PostgreSQL, SQLite, Git, Pytest, Docker, Docker Compose and Nginx.

## Expected outcome
A user can submit the included demo bug and observe a complete fail -> retrieve -> repair -> pass -> review -> branch/commit -> PR-preview workflow. The system exposes evidence at every stage instead of returning an unexplained code answer.

## Evaluation
Release 1.0 includes four backend automated tests and a three-case controlled benchmark. The captured benchmark result is 3/3 successful cases. The final college report should also contain dashboard screenshots, API documentation screenshots and the live demo output.
