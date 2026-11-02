# User Manual

## 1. Sign in

Use the configured account. The semester demo credentials are pre-filled on the login screen.

## 2. Choose a repository

- Click **Load Demo Project** for the included controlled demonstration, or
- use **Add repository** and provide a project name plus an HTTP(S) Git repository URL.

## 3. Submit a bug

A strong report contains:

```text
Observed behavior:
Expected behavior:
Steps to reproduce:
Important input/boundary value:
Acceptance criterion:
```

Click **Queue autonomous run**.

## 4. Follow the execution trace

The dashboard shows:

- triage,
- workspace preparation,
- indexing,
- baseline test evidence,
- RAG retrieval,
- repair,
- verification tests,
- automated review,
- Git branch/commit,
- completion.

## 5. Review evidence

Do not judge the patch only from the final code. Review:

- whether the baseline test reproduced the bug,
- which source chunks were retrieved,
- exact Git diff,
- verification test output,
- review score/blockers/warnings,
- generated branch and PR summary.

## 6. Human decision

Only a human should decide whether the change is appropriate to push/merge into the real repository.
