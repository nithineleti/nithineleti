# Viva Questions and Short Answers

## 1. What is CodePilot?
CodePilot is an autonomous bug-resolution platform that turns a repository plus bug report into a validated local code change, test evidence, automated review, Git branch/commit and pull-request preview for human approval.

## 2. What makes it different from code completion?
Code completion mainly suggests code. CodePilot orchestrates repository retrieval, defect reproduction, repair, verification, diff review, learning signals and delivery evidence.

## 3. Is it fully unsupervised?
The engineering workflow is autonomous, but merge authority is intentionally human. Tests are incomplete specifications, so final business/security approval should not be automated blindly.

## 4. What are the agents?
Triage, Retrieval, Validation, Repair, Review and Delivery. They have separate responsibilities and are coordinated by the run pipeline.

## 5. Where is NLP used?
The triage stage interprets natural-language bug reports and extracts threshold values, inclusive-boundary phrases and scope constraints. The report also becomes part of the retrieval query.

## 6. Where is RAG used?
Repository source is chunked and embedded. The bug report plus baseline-test evidence forms the query. The retrieval agent ranks source chunks before repair, so the repair stage receives focused repository context.

## 7. How are embeddings produced in the offline version?
Tokens are hashed into a deterministic 384-dimensional vector and normalized. Cosine similarity is combined with lexical and source-path signals. This keeps the demo reproducible and dependency-light.

## 8. Is this the same as a neural semantic embedding model?
No. It is a transparent hashed-vector embedding suitable for the included project. The architecture lets a semantic embedder/vector database replace it later without changing the rest of the workflow.

## 9. Why run tests before and after?
Baseline tests provide evidence that the defect exists. Verification tests show whether the patch resolves the failure while preserving the existing suite.

## 10. What if baseline tests already pass?
The run still records that evidence. It means the report may not be represented by the current test suite, so human confidence should be lower. A future version can generate or require a regression test before repair.

## 11. What is the reinforcement-learning component?
Repair strategies receive a reward from baseline reproduction, verification success and review approval. When multiple strategies are available, a UCB1 multi-armed-bandit policy ranks them using historical reward plus an exploration bonus.

## 12. Why UCB1?
It is simple, explainable and demonstrates the exploration-versus-exploitation idea without requiring a large training pipeline. That makes it appropriate for a semester system where every engineering decision should be defendable.

## 13. What happens if verification fails?
The review gate rejects the patch. The run is not delivered as an approved PR-ready change.

## 14. What does the reviewer check?
Verification status, presence of a diff, changed-file scope, likely secrets added by the patch and selected risky constructs such as dynamic execution or shell execution.

## 15. Why use a worker process?
Repository cloning, indexing and tests can be long-running. A worker keeps those operations out of the normal HTTP request path and allows API/worker separation in the production-style stack.

## 16. Why PostgreSQL and SQLite both?
SQLite makes the local classroom demo easy. PostgreSQL supports concurrent API/worker access and is used in Docker Compose as the production-style database.

## 17. What is the most important security risk?
Running repository tests executes repository code. Public untrusted repositories must be executed in an isolated environment with no secrets and strict resource/network/filesystem controls.

## 18. Does CodePilot push or merge code automatically?
No. Version 1.0 creates the local branch/commit and PR preview. This is a deliberate human-governance boundary.

## 19. What are the benchmark results?
The included controlled benchmark has three inclusive-boundary cases. All 3/3 reproduced the defect, retrieved source context, passed verification after repair and were approved by review. This is a controlled result, not a claim of 100% accuracy on arbitrary repositories.

## 20. What are the current limitations?
The offline repair family is intentionally narrow; arbitrary defects need more repair strategies or the optional inference contract. Public multi-tenant execution also requires stronger sandbox infrastructure and a durable distributed queue.

## 21. How would you scale the system?
Use managed PostgreSQL, a durable queue, autoscaled workers, ephemeral sandbox jobs, persistent vector storage, centralized logs/metrics, per-user quotas, stronger code-host connectors and role-based authorization.

## 22. What would you implement next?
Regression-test generation, dependency/call graph retrieval, semantic embeddings, static security scanners and iterative patch-test-review loops with strict retry budgets.
