# Architecture
`Web UI → POST /api/analyze → Repository Indexer → Retriever → Patch Planner → Sandbox → Test Runner → Diff + Status`

- **Indexer/Retriever:** sparse vector representation with TF-IDF and cosine similarity.
- **Patch planner:** deterministic safe rule in the local demo; provider-neutral LLM adapter is isolated behind `providers/`.
- **Sandbox:** copies the repository to a temporary directory before changing files.
- **Validator:** runs pytest with a timeout and reports before/after state.
- **Guardrail:** never modifies the bundled source during analysis; only returns a patch for review.
