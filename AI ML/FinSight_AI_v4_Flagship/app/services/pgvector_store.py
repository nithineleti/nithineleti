from __future__ import annotations
from sqlalchemy import text
from sqlalchemy.orm import Session
from ..config import get_settings
from .embeddings import deserialize_embedding
from ..models import Chunk

settings = get_settings()


def vector_literal(vector) -> str:
    return "[" + ",".join(f"{float(x):.8f}" for x in vector) + "]"


def ensure_pgvector_schema(db: Session) -> bool:
    if not settings.is_postgres:
        return False
    try:
        db.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        # Keep a JSON copy for portability; PostgreSQL also gets the native vector.
        db.execute(text(f"ALTER TABLE chunks ADD COLUMN IF NOT EXISTS embedding vector({settings.embedding_dimension})"))
        db.execute(text("CREATE INDEX IF NOT EXISTS ix_chunks_embedding_hnsw ON chunks USING hnsw (embedding vector_cosine_ops)"))
        db.commit()
        return True
    except Exception:
        db.rollback()
        return False


def sync_chunk_vectors(db: Session, chunks: list[Chunk]) -> int:
    if not settings.is_postgres or not ensure_pgvector_schema(db):
        return 0
    count = 0
    for chunk in chunks:
        vector = deserialize_embedding(chunk.embedding_json)
        if vector is None:
            continue
        try:
            db.execute(
                text("UPDATE chunks SET embedding = CAST(:vec AS vector) WHERE id = :id"),
                {"vec": vector_literal(vector), "id": chunk.id},
            )
            count += 1
        except Exception:
            db.rollback()
            return count
    db.commit()
    return count


def status(db: Session) -> dict:
    if not settings.is_postgres:
        return {"configured": False, "active": False, "reason": "SQLite/local mode"}
    try:
        active = bool(db.scalar(text("SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname='vector')")))
        return {"configured": True, "active": active, "index": "HNSW/cosine" if active else None}
    except Exception as exc:
        db.rollback()
        return {"configured": True, "active": False, "reason": str(exc)[:180]}
