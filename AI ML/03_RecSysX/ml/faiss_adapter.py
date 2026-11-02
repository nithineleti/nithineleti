def build_index(vectors):
    """Use FAISS when installed; otherwise caller can use sklearn cosine search."""
    import faiss
    index=faiss.IndexFlatIP(vectors.shape[1]); index.add(vectors.astype("float32")); return index
