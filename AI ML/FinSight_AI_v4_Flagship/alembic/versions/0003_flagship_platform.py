"""flagship agentic financial intelligence platform

Revision ID: 0003_flagship_platform
Revises: 0002_advanced_rag
"""
from alembic import op
import sqlalchemy as sa

revision = "0003_flagship_platform"
down_revision = "0002_advanced_rag"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("display_name", sa.String(length=120), nullable=True))
    op.create_table(
        "workspaces",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("owner_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_workspaces_owner_id", "workspaces", ["owner_id"])
    op.create_table(
        "memberships",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("workspace_id", sa.Integer(), sa.ForeignKey("workspaces.id"), nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("role", sa.String(length=32), nullable=False),
        sa.UniqueConstraint("workspace_id", "user_id", name="uq_workspace_user"),
    )
    op.create_index("ix_memberships_workspace_id", "memberships", ["workspace_id"])
    op.create_index("ix_memberships_user_id", "memberships", ["user_id"])

    with op.batch_alter_table("documents") as batch:
        batch.add_column(sa.Column("workspace_id", sa.Integer(), nullable=True))
        batch.add_column(sa.Column("source_url", sa.String(length=2048), nullable=True))
        batch.add_column(sa.Column("source_date", sa.String(length=32), nullable=True))
        batch.create_foreign_key("fk_documents_workspace_id_workspaces", "workspaces", ["workspace_id"], ["id"])
        batch.create_index("ix_documents_workspace_id", ["workspace_id"])
    op.add_column("financial_points", sa.Column("company", sa.String(length=120), nullable=True))
    op.add_column("financial_points", sa.Column("metric", sa.String(length=80), nullable=True))
    op.create_index("ix_financial_points_company", "financial_points", ["company"])
    op.add_column("research_audit", sa.Column("latency_ms", sa.Float(), nullable=False, server_default="0"))

    op.create_table(
        "knowledge_entities",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(length=180), nullable=False),
        sa.Column("entity_type", sa.String(length=64), nullable=False),
        sa.Column("company", sa.String(length=120), nullable=True),
        sa.Column("metadata_json", sa.Text(), nullable=True),
        sa.UniqueConstraint("name", "entity_type", "company", name="uq_entity_identity"),
    )
    op.create_index("ix_knowledge_entities_name", "knowledge_entities", ["name"])
    op.create_index("ix_knowledge_entities_entity_type", "knowledge_entities", ["entity_type"])
    op.create_index("ix_knowledge_entities_company", "knowledge_entities", ["company"])
    op.create_table(
        "knowledge_relations",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("source_entity_id", sa.Integer(), sa.ForeignKey("knowledge_entities.id"), nullable=False),
        sa.Column("target_entity_id", sa.Integer(), sa.ForeignKey("knowledge_entities.id"), nullable=False),
        sa.Column("relation_type", sa.String(length=80), nullable=False),
        sa.Column("evidence_document_id", sa.Integer(), sa.ForeignKey("documents.id"), nullable=True),
        sa.Column("evidence_text", sa.Text(), nullable=True),
        sa.Column("weight", sa.Float(), nullable=False),
        sa.UniqueConstraint("source_entity_id", "target_entity_id", "relation_type", "evidence_document_id", name="uq_graph_relation"),
    )
    op.create_index("ix_knowledge_relations_source_entity_id", "knowledge_relations", ["source_entity_id"])
    op.create_index("ix_knowledge_relations_target_entity_id", "knowledge_relations", ["target_entity_id"])
    op.create_index("ix_knowledge_relations_relation_type", "knowledge_relations", ["relation_type"])

    op.create_table(
        "earnings_utterances",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("company", sa.String(length=120), nullable=False),
        sa.Column("period", sa.String(length=32), nullable=False),
        sa.Column("speaker", sa.String(length=120), nullable=False),
        sa.Column("role", sa.String(length=40), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("source", sa.String(length=255), nullable=True),
    )
    op.create_index("ix_earnings_utterances_company", "earnings_utterances", ["company"])
    op.create_index("ix_earnings_utterances_period", "earnings_utterances", ["period"])

    op.create_table(
        "news_events",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("company", sa.String(length=120), nullable=False),
        sa.Column("ticker", sa.String(length=16), nullable=True),
        sa.Column("headline", sa.String(length=500), nullable=False),
        sa.Column("event_type", sa.String(length=64), nullable=False),
        sa.Column("sentiment", sa.Float(), nullable=False),
        sa.Column("impact_score", sa.Float(), nullable=False),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("source", sa.String(length=120), nullable=False),
        sa.Column("source_url", sa.String(length=2048), nullable=True),
    )
    op.create_index("ix_news_events_company", "news_events", ["company"])
    op.create_index("ix_news_events_ticker", "news_events", ["ticker"])
    op.create_index("ix_news_events_event_type", "news_events", ["event_type"])

    op.create_table(
        "watchlists",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_watchlists_user_id", "watchlists", ["user_id"])
    op.create_table(
        "watchlist_items",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("watchlist_id", sa.Integer(), sa.ForeignKey("watchlists.id"), nullable=False),
        sa.Column("ticker", sa.String(length=16), nullable=False),
        sa.Column("company", sa.String(length=120), nullable=False),
        sa.UniqueConstraint("watchlist_id", "ticker", name="uq_watchlist_ticker"),
    )
    op.create_index("ix_watchlist_items_watchlist_id", "watchlist_items", ["watchlist_id"])

    op.create_table(
        "alert_rules",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("ticker", sa.String(length=16), nullable=False),
        sa.Column("event_type", sa.String(length=64), nullable=False),
        sa.Column("threshold", sa.Float(), nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_alert_rules_user_id", "alert_rules", ["user_id"])

    op.create_table(
        "portfolio_positions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("ticker", sa.String(length=16), nullable=False),
        sa.Column("company", sa.String(length=120), nullable=False),
        sa.Column("shares", sa.Float(), nullable=False),
        sa.Column("cost_basis", sa.Float(), nullable=False),
        sa.Column("current_price", sa.Float(), nullable=False),
        sa.UniqueConstraint("user_id", "ticker", name="uq_user_position_ticker"),
    )
    op.create_index("ix_portfolio_positions_user_id", "portfolio_positions", ["user_id"])

    op.create_table(
        "research_reports",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("company", sa.String(length=120), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("report_json", sa.Text(), nullable=False),
        sa.Column("markdown_path", sa.String(length=1024), nullable=True),
        sa.Column("pdf_path", sa.String(length=1024), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_research_reports_user_id", "research_reports", ["user_id"])
    op.create_index("ix_research_reports_company", "research_reports", ["company"])


def downgrade() -> None:
    op.drop_table("research_reports")
    op.drop_table("portfolio_positions")
    op.drop_table("alert_rules")
    op.drop_table("watchlist_items")
    op.drop_table("watchlists")
    op.drop_table("news_events")
    op.drop_table("earnings_utterances")
    op.drop_table("knowledge_relations")
    op.drop_table("knowledge_entities")
    op.drop_index("ix_financial_points_company", table_name="financial_points")
    op.drop_column("financial_points", "metric")
    op.drop_column("financial_points", "company")
    op.drop_column("research_audit", "latency_ms")
    with op.batch_alter_table("documents") as batch:
        batch.drop_index("ix_documents_workspace_id")
        batch.drop_constraint("fk_documents_workspace_id_workspaces", type_="foreignkey")
        batch.drop_column("source_date")
        batch.drop_column("source_url")
        batch.drop_column("workspace_id")
    op.drop_table("memberships")
    op.drop_table("workspaces")
    op.drop_column("users", "display_name")
