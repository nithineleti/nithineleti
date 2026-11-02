# 7-Minute Semester Demo Script

## 0:00-0:40 — Introduction

"CodePilot addresses the complete bug-resolution cycle. Instead of only suggesting code, it accepts a repository and bug report, retrieves relevant code, reproduces the issue with tests, generates a targeted fix, validates it, reviews the diff, and prepares a pull-request-ready change for human approval."

## 0:40-1:20 — Architecture

Show `docs/ARCHITECTURE.md` or your PPT architecture slide. Mention React, FastAPI, worker, PostgreSQL, code-vector retrieval, patch gateway, test runner, review gate, Git, Docker.

## 1:20-2:00 — Dashboard

1. Log in using the demo account.
2. Click **Load Demo Project**.
3. Explain the intentional bug: a loyal customer at exactly 100 should receive a 10% discount, but the code incorrectly requires more than 100.

## 2:00-2:30 — Submit bug

Keep the pre-filled bug report and click **Queue autonomous run**.

## 2:30-3:30 — Agent timeline

As the worker progresses, point to:
- workspace preparation,
- indexing,
- baseline tests,
- retrieval,
- patch,
- verification,
- review,
- completion.

## 3:30-4:10 — Evidence of reproduction

Show **Baseline tests**. The test at exactly 100 must fail. Explain that this proves the system did not blindly modify passing code.

## 4:10-4:50 — RAG retrieval

Show **Retrieved code context**. Point out `invoice_service.py` and the `loyalty_discount` function. Explain that retrieval narrows the repository context before patch generation.

## 4:50-5:30 — Patch and verification

Show the Git diff:

```diff
-    if loyal_customer and subtotal > 100:
+    if loyal_customer and subtotal >= 100:
```

Then show **Verification tests: Passed**.

## 5:30-6:10 — Automated review

Show that the reviewer checks passing tests, changed-file count, diff presence, secret patterns, and risky constructs before approving the patch for human review.

## 6:10-6:40 — PR preview

Show generated title, description, changed files, test command, and branch.

## 6:40-7:00 — Closing

"The key safety decision is that CodePilot does not merge directly. Automation prepares and validates the engineering change, while a human remains the final authority."
