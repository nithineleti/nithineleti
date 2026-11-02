# Interview Q&A
**Why use retrieval first?** It reduces the search space and gives the planner repository-specific context.

**Why sandbox execution?** Generated changes should not modify the source repository before validation and approval.

**How would you scale it?** Persist embeddings in a vector index, incremental re-indexing on commits, isolate test jobs in containers, queue long-running tasks, cache repository metadata and stream status events.

**What metrics matter?** File-retrieval recall@k, patch pass rate, regression rate, time-to-fix, false-positive patch rate and human acceptance rate.
