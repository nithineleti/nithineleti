# Presentation Script
## 60-second version
“CodePilot AI automates the repetitive part of bug resolution. A developer enters a bug report. The service vectorizes repository files, retrieves the most relevant code, generates a minimal patch, applies it only inside a temporary sandbox, runs automated tests, and returns a unified diff for human review. In my demo, a 100% coupon is incorrectly rejected. The original tests fail, the generated boundary-condition fix is applied, and the tests pass. I focused on validation and human approval rather than blindly editing source code.”

## 5-minute flow
1. Problem: developers spend time locating code and validating small bugs.
2. Architecture: retrieval, planning, sandboxing, tests, review.
3. Live demo: run the bundled coupon bug.
4. Engineering choices: FastAPI, vector search, pytest subprocess isolation, Docker/CI.
5. Limitations: local deterministic patch rule; future model integration, GitHub PRs, policy checks and observability.
