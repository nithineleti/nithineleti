# Software Requirements Specification (SRS)

## 1. Product

**Name:** CodePilot  
**Category:** Autonomous software engineering / bug-resolution platform  
**Primary users:** developers, student teams, maintainers and QA engineers

## 2. Purpose

CodePilot reduces the manual effort between receiving a bug report and preparing a validated software change. It automates repository acquisition, natural-language triage, code indexing/retrieval, baseline testing, constrained repair, verification, automated review, learning signals, Git evidence and pull-request preparation while retaining human control of merge decisions.

## 3. Functional requirements

### FR-01 Authentication
The system shall authenticate users before project/run access.

### FR-02 Project registration
The system shall accept an HTTP(S) Git repository URL and shall also provide a controlled built-in demo project.

### FR-03 Workspace creation
The system shall create a clean per-run repository workspace.

### FR-04 Natural-language triage
The system shall extract defect-oriented signals such as thresholds and inclusive-boundary language from the bug report.

### FR-05 Code indexing
The system shall scan supported source files, exclude generated/vendor directories, chunk code and generate vector representations.

### FR-06 Context retrieval
The system shall rank code chunks against the bug report plus available failing-test evidence.

### FR-07 Baseline validation
The system shall run a supported automated test command before repair when one is detected.

### FR-08 Patch proposal
The system shall produce constrained file edits using an eligible repair strategy.

### FR-09 Patch path safety
The system shall reject edits that escape the repository workspace or fail deterministic occurrence checks.

### FR-10 Verification
The system shall re-run tests after repair and record exit code, duration, command and output.

### FR-11 Automated review
The system shall evaluate verification state, diff presence, changed-file count, likely secret leakage and selected risky constructs.

### FR-12 Reward learning
The system shall record a bounded strategy reward and maintain online repair-strategy statistics.

### FR-13 Git evidence
The system shall generate a unified diff, fix branch and commit when review passes.

### FR-14 PR preview
The system shall generate a pull request title, body, branch and changed-file list for human review.

### FR-15 Audit timeline
The system shall persist stage-by-stage events and expose them to the dashboard.

### FR-16 Worker execution
The production stack shall support a worker process separate from the API service.

### FR-17 Offline demo
The system shall demonstrate a complete successful workflow without requiring paid external inference credentials.

### FR-18 Human gate
The system shall not automatically merge code.

## 4. Non-functional requirements

- **Security:** environment-based secrets, repository/path limits, test timeouts, authorization and human approval.
- **Reliability:** run status, evidence and failure information are persisted.
- **Observability:** health/readiness endpoints and event traces are provided.
- **Portability:** local Python/Node execution and Docker Compose are supported.
- **Maintainability:** repository, retrieval, testing, repair, review and delivery concerns are separated.
- **Scalability:** API and worker are separable and PostgreSQL is used by the production-style stack.
- **Usability:** evidence is visible rather than hiding the engineering process behind a single answer.
- **Reproducibility:** the controlled demo and benchmark use deterministic defects and tests.

## 5. Constraints

- No automated system can guarantee a correct fix for every repository and language.
- The offline repair strategy intentionally covers controlled inclusive-boundary defects.
- Broader defects require additional repair strategies or the configured inference contract.
- Validation confidence depends on repository test quality.
- Executing arbitrary repository code requires a stronger sandbox for public multi-tenant deployment.

## 6. Acceptance criteria for release 1.0

The included demo is accepted when CodePilot:

1. authenticates the demo user,
2. loads the controlled repository,
3. records bug triage,
4. reproduces the failing boundary test,
5. retrieves the relevant source function,
6. changes the strict threshold to an inclusive threshold,
7. produces a non-empty Git diff,
8. passes all verification tests,
9. receives automated review approval,
10. records a learning reward,
11. creates a fix branch/commit,
12. produces a PR preview.
