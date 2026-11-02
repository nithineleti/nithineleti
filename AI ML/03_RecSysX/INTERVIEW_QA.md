# Interview Q&A
**Why hybrid?** Content handles sparse/cold-start cases; collaborative signals capture behavior not obvious from metadata.

**How do you evaluate?** Precision@K, Recall@K, NDCG@K, hit rate, coverage, diversity, novelty and online CTR/conversion.

**How would you serve millions of items?** Learn user/item embeddings, precompute item vectors, use FAISS/HNSW ANN retrieval, then apply a smaller ranking model to a few hundred candidates.
