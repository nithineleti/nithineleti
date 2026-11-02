# Test Plan

## 1. Test strategy

CodePilot uses four validation layers:

1. **Unit/component tests** for retrieval and review behavior.
2. **Pipeline integration test** for fail -> retrieve -> repair -> verify -> review.
3. **API integration test** for health, authentication and demo project creation.
4. **Controlled benchmark** for repeatable end-to-end defect cases.

The CI workflow also includes a React production-build job.

## 2. Included backend automated tests

| Test | Coverage | Expected result |
|---|---|---|
| `test_retrieval_finds_invoice_service` | AST/chunk indexing + RAG ranking | Relevant service source appears in retrieval |
| `test_demo_repair_end_to_end` | Baseline test, retrieval, patch, verification, diff, review | Baseline fails; repaired suite passes; review approves |
| `test_review_rejects_failed_verification` | Negative review gate | Failed verification is rejected |
| `test_health_and_demo_login` | FastAPI lifespan, demo account, bearer login, demo project | All endpoints return expected successful state |

Run:

```bash
PYTHONPATH=backend pytest -q backend/tests
```

Expected included result: **4 passed**.

## 3. Controlled benchmark

Run:

```bash
PYTHONPATH=backend python -m app.benchmark
```

Cases:

| Case | Defect family | Expected repair |
|---|---|---|
| Loyalty threshold | Inclusive lower bound | `> 100` -> `>= 100` |
| Minimum age | Inclusive lower bound | `> 18` -> `>= 18` |
| Maximum retries | Inclusive upper bound | `< 3` -> `<= 3` |

Release 1.0 captured result: **3/3 successful controlled cases (100%)**. See `BENCHMARK_RESULTS.txt`.

This metric is intentionally labelled a controlled benchmark and must not be presented as 100% accuracy on arbitrary software defects.

## 4. Manual UI acceptance tests

| ID | Flow | Procedure | Pass condition |
|---|---|---|---|
| MT-01 | Login | Use demo account | Command Center opens |
| MT-02 | Demo project | Click **Load Demo Project** | Demo repository and report load |
| MT-03 | Repository form | Open **Add repository** | Project URL form is visible |
| MT-04 | Queue run | Submit demo bug | Run enters queued/running state |
| MT-05 | Timeline | Observe run | Triage through completion events appear |
| MT-06 | Baseline | Inspect baseline card | Boundary test is shown as reproduced failure |
| MT-07 | Retrieval | Inspect relevant context | Service source appears |
| MT-08 | Diff | Inspect patch | Exclusive comparison changes to inclusive |
| MT-09 | Verification | Inspect verification card | Test suite passes |
| MT-10 | Review | Inspect quality gate | Approved for human review, score 100 for demo |
| MT-11 | Delivery | Inspect PR card | Branch and PR preview are visible |
| MT-12 | API docs | Open `/docs` | FastAPI OpenAPI UI loads |

## 5. Security-oriented tests to add before public deployment

- path traversal edit attempts,
- oversized repository rejection,
- localhost/private-network repository URL policy,
- authentication expiry/tampering,
- ownership isolation between users,
- secret-pattern patch rejection,
- test timeout behavior,
- sandbox escape testing on the chosen production execution platform.
