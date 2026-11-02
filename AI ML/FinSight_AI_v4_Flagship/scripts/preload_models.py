"""Optional model warmup for the full ML profile.

Run only after installing requirements-ml.txt. Model downloads require network access.
"""
from sentence_transformers import SentenceTransformer, CrossEncoder

print("Loading dense embedding model...")
SentenceTransformer("sentence-transformers/all-MiniLM-L6-v2")
print("Loading cross-encoder reranker...")
CrossEncoder("cross-encoder/ms-marco-MiniLM-L-6-v2")
print("Model cache warmup complete.")
