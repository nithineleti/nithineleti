# Interview Q&A
**What is drift?** A meaningful change in the input or target distribution between training and production.

**Why PSI?** It is simple, interpretable and commonly used for monitoring tabular feature distribution shifts. It should be combined with model-quality metrics when labels arrive.

**When should retraining happen?** Not on drift alone. Use drift severity, business impact, enough new labeled data, performance degradation and approval/rollback policies.
