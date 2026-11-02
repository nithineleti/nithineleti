# CodePilot — Semester Project Report Draft

## Proposed title

**CodePilot: Autonomous Software Engineering Agent for Repository-Level Bug Resolution**

## Abstract

Software defect resolution requires more than writing code. A developer must understand a report, locate relevant source files, reproduce the issue, modify the implementation, execute tests, inspect the resulting diff and prepare the change for review. CodePilot models this process as an auditable autonomous engineering workflow. The system combines natural-language defect triage, repository indexing, retrieval-augmented code selection, constrained repair generation, automated baseline and verification testing, Git diff analysis, safety/quality gates, online reward learning and human-governed delivery. The implementation uses a React interface, Python/FastAPI backend, PostgreSQL production persistence, an independent worker, deterministic 384-dimensional code vectors, Git, Docker, Nginx and automated tests. A controlled offline repair engine allows the full workflow to be demonstrated without paid external inference services. In the included three-case controlled benchmark, all three defects were reproduced, relevant source context was retrieved, verification passed after repair and automated review approved the changes. CodePilot therefore demonstrates an end-to-end software engineering agent while preserving human authority over final repository integration.

## 1. Introduction

Bug fixing is a multi-stage reasoning and verification task. Developers frequently switch among issue descriptions, source search, IDE navigation, terminal tests, Git diffs and code-review interfaces. A code suggestion by itself does not prove that the reported behavior is fixed. CodePilot integrates these activities into one traceable workflow whose final output is evidence for a human reviewer.

## 2. Problem statement

Developers spend significant time understanding bug reports, finding relevant files, reproducing defects, creating changes, validating tests, reviewing scope and preparing pull requests. Existing assistance that stops at code generation leaves much of the engineering verification process manual. The project addresses the need for a system that can perform the complete pre-merge bug-resolution workflow and expose verifiable evidence.

## 3. Objectives

- Accept a repository and natural-language bug report.
- Extract defect signals from the report.
- Build a searchable code representation.
- Retrieve source context relevant to the defect.
- Run baseline tests and capture failure evidence.
- Generate and apply a minimal constrained patch.
- Re-run the repository test suite.
- Review change scope and selected security signals.
- Learn a reward value for the repair strategy.
- Create a Git branch/commit and PR-ready summary.
- Persist a complete execution timeline.
- Require human approval before merge.

## 4. Existing workflow and limitations

A manual workflow involves reading an issue, searching the repository, forming a hypothesis, editing code, executing tests, reviewing the diff and writing a pull request. Individual coding tools can accelerate isolated steps but do not necessarily coordinate reproduction, validation and review. This creates repeated context switching and can encourage changes that have not been verified against tests.

## 5. Proposed system

CodePilot is divided into a React web client, FastAPI API, relational database, background worker and repository execution workspace. A multi-agent orchestration layer assigns specialized responsibilities to triage, retrieval, validation, repair, review and delivery agents. Each stage records events into the database. The result is a pull-request-ready local branch/commit and evidence package, not an automatic merge.

## 6. Technology stack

- **Frontend:** React + Vite
- **Backend:** Python + FastAPI
- **Persistence:** PostgreSQL; SQLite fallback for local demo
- **ORM:** SQLAlchemy
- **Repository operations:** Git CLI
- **NLP triage:** deterministic phrase/threshold extraction
- **Code parsing:** Python AST + generic source windows
- **RAG retrieval:** 384-D hashed vectors + cosine/lexical ranking
- **Testing:** Pytest or repository JavaScript test script when detected
- **Learning:** UCB1 bandit-style repair-strategy ranking + outcome rewards
- **Deployment:** Docker, Docker Compose and Nginx
- **CI:** backend automated tests + frontend production build workflow

## 7. Multi-agent design

### Triage agent
Converts the natural-language report into structured defect signals such as numeric thresholds, inclusive-boundary intent and scope constraints.

### Retrieval agent
Indexes code and ranks source chunks using the report plus test evidence.

### Validation agent
Runs baseline and verification tests and records machine-verifiable evidence.

### Repair agent
Selects an eligible repair strategy and applies validated file edits.

### Review agent
Evaluates verification result, diff scope, likely secret leakage and risky constructs.

### Delivery agent
Creates the branch/commit and the PR preview for a human reviewer.

## 8. Retrieval-augmented generation concept

Rather than treating an entire repository as one context, CodePilot divides source code into meaningful chunks. Python functions/classes are extracted using AST. Each chunk and bug query receives a 384-dimensional hashed vector. Cosine similarity is combined with lexical overlap and source-path weighting. The highest-ranked context is passed to the repair stage. The architecture is intentionally modular so a semantic embedder/vector database can replace the deterministic implementation later.

## 9. Reinforcement-learning component

CodePilot maintains outcome statistics per repair strategy. After a run, the strategy receives a bounded reward from three signals: whether the baseline reproduced the bug, whether verification passed and whether review approved the patch. When multiple strategies are available, a UCB1 policy ranks them using average historical reward plus an exploration bonus. This is a compact, transparent multi-armed-bandit implementation suitable for demonstrating online reinforcement learning in a semester project.

## 10. Database design

Main tables:

- `users` — authenticated user account,
- `projects` — repository registration and ownership,
- `runs` — bug report, status, tests, retrieval, patch, review, diff and PR preview,
- `run_events` — ordered stage-by-stage audit trail.

See `ARCHITECTURE.md` for the ER diagram.

## 11. End-to-end workflow

1. User authenticates.
2. User chooses a repository and submits a bug report.
3. API persists a queued run.
4. Worker triages the report.
5. A clean repository workspace is created.
6. Source code is indexed.
7. Baseline tests execute.
8. Report + test evidence drive retrieval.
9. Repair strategy is selected and constrained edits are applied.
10. Verification tests execute.
11. Review gate analyzes test status and Git diff.
12. Reward learning updates strategy statistics.
13. Successful changes receive a fix branch and commit.
14. Delivery agent creates a PR preview.
15. Human reviews before any real merge.

## 12. Testing and measured results

Backend automated test command:

```bash
PYTHONPATH=backend pytest -q backend/tests
```

Current included suite: **4 automated tests passing**.

A controlled benchmark evaluates three inclusive-boundary defects:

| Case | Baseline defect reproduced | Source retrieval hit | Verification | Review |
|---|---:|---:|---:|---:|
| Loyalty threshold | Yes | Yes | Pass | Approved |
| Minimum age | Yes | Yes | Pass | Approved |
| Maximum retries | Yes | Yes | Pass | Approved |
| **Total** | **3/3** | **3/3** | **3/3** | **3/3** |

Controlled-case end-to-end success: **100% (3/3)**. This is not a claim of 100% performance on arbitrary real-world repositories; it is the reproducible result of the included benchmark cases. Raw output is saved in `BENCHMARK_RESULTS.txt`.

## 13. Demo defect

The main demonstration uses a loyalty discount boundary.

Incorrect condition:

```python
if loyal_customer and subtotal > 100:
```

Business rule: a loyal customer qualifies at **100 or above**.

Validated repair:

```python
if loyal_customer and subtotal >= 100:
```

The test at exactly 100 fails before the patch and the complete suite passes afterward.

## 14. Security

The most important security issue is arbitrary repository code execution during tests. The local runner is intended for trusted classroom repositories. Public multi-tenant use requires ephemeral sandbox infrastructure with strict filesystem, secret, resource and network isolation. The implemented application additionally includes URL/path validation, repository/file limits, timeouts, scrypt password hashing, signed sessions, ownership authorization, diff secret scanning and a mandatory human gate.

## 15. Limitations

- The offline repair strategy intentionally covers a limited controlled defect family.
- General repair quality depends on additional repair strategies/inference configuration.
- Test suites are incomplete specifications; passing tests do not prove all regressions are absent.
- JavaScript repositories require their test dependencies to be available in the execution environment.
- Public untrusted repository execution requires stronger isolation than the classroom process runner.
- The current worker queue is appropriate for a single worker service; large-scale deployment should use a durable queue/locking strategy.

## 16. Future enhancements

- semantic neural code embeddings,
- persistent vector database,
- dependency/call graph retrieval,
- bounded iterative patch-test-review loops,
- automatic regression-test generation,
- static analysis and dependency security scanners,
- ephemeral sandbox scheduler,
- durable distributed job queue,
- issue-tracker and code-host connectors,
- role-based access control and SSO,
- larger SWE-style benchmark evaluation,
- human feedback incorporated into repair policy.

## 17. Conclusion

CodePilot demonstrates that autonomous software engineering is best treated as a verified workflow rather than a single code response. The project combines NLP, RAG, code representation, multi-agent orchestration, online reward learning, automated testing, Git, backend/frontend engineering, databases and deployment in one system. Its central design principle is evidence-first automation: reproduce, retrieve, repair, verify, review, then hand control to a human.

## 18. References section for final university report

Add references using your department's required citation style. Recommended categories are official documentation for Python, FastAPI, React, PostgreSQL, Docker, Git and Pytest, plus academic literature on retrieval-augmented generation, software-engineering agents, program repair, code representation and automated software testing. Do not claim results from a paper unless you have read and cited the original source.
