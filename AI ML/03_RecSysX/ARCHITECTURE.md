# Architecture
`Interactions + Item Metadata → Feature Builder → Content Vectors + User Similarity → Hybrid Ranker → Top-K Filter → FastAPI → UI`

Production extension: event stream → feature store → two-tower trainer → vector index → online ranker → experimentation platform.
