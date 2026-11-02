"""advanced hybrid RAG and pgvector schema

Revision ID: 0002_advanced_rag
Revises: 0001_initial
"""
from alembic import op
import sqlalchemy as sa

revision = "0002_advanced_rag"
down_revision = "0001_initial"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("documents", sa.Column("storage_uri", sa.String(length=1024), nullable=True))
    op.add_column("chunks", sa.Column("embedding_json", sa.Text(), nullable=True))
    op.add_column("chunks", sa.Column("embedding_model", sa.String(length=180), nullable=True))
    op.add_column("research_audit", sa.Column("retrieval_mode", sa.String(length=32), nullable=False, server_default="hybrid"))
    op.add_column("research_audit", sa.Column("generator_backend", sa.String(length=64), nullable=False, server_default="extractive"))

    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute("CREATE EXTENSION IF NOT EXISTS vector")
        op.execute("ALTER TABLE chunks ADD COLUMN IF NOT EXISTS embedding vector(384)")
        op.execute("CREATE INDEX IF NOT EXISTS ix_chunks_embedding_hnsw ON chunks USING hnsw (embedding vector_cosine_ops)")


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute("DROP INDEX IF EXISTS ix_chunks_embedding_hnsw")
        op.execute("ALTER TABLE chunks DROP COLUMN IF EXISTS embedding")
    op.drop_column("research_audit", "generator_backend")
    op.drop_column("research_audit", "retrieval_mode")
    op.drop_column("chunks", "embedding_model")
    op.drop_column("chunks", "embedding_json")
    op.drop_column("documents", "storage_uri")
