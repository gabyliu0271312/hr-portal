"""add AI channel session and event idempotency tables

Revision ID: 0107
Revises: 0106
Create Date: 2026-07-21
"""
from alembic import op
import sqlalchemy as sa


revision = "0107"
down_revision = "0106"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "ai_channel_sessions",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("channel", sa.String(length=16), nullable=False),
        sa.Column("external_session_hash", sa.String(length=64), nullable=False),
        sa.Column("user_id", sa.BigInteger(), nullable=False),
        sa.Column("conversation_id", sa.BigInteger(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["conversation_id"], ["ai_conversations.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("channel", "external_session_hash", name="uq_ai_channel_sessions_channel_external"),
    )
    op.create_index("ix_ai_channel_sessions_user_channel", "ai_channel_sessions", ["user_id", "channel"])
    op.create_table(
        "ai_channel_events",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("channel", sa.String(length=16), nullable=False),
        sa.Column("event_key_hash", sa.String(length=64), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False, server_default="received"),
        sa.Column("received_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("channel", "event_key_hash", name="uq_ai_channel_events_channel_event"),
    )
    op.create_index("ix_ai_channel_events_received", "ai_channel_events", ["received_at"])


def downgrade() -> None:
    op.drop_index("ix_ai_channel_events_received", table_name="ai_channel_events")
    op.drop_table("ai_channel_events")
    op.drop_index("ix_ai_channel_sessions_user_channel", table_name="ai_channel_sessions")
    op.drop_table("ai_channel_sessions")
