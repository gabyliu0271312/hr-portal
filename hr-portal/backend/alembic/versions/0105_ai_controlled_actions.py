"""add server-controlled AI action authorizations

Revision ID: 0105
Revises: 0104
Create Date: 2026-07-21
"""
from alembic import op
import sqlalchemy as sa


revision = "0105"
down_revision = "0104"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "ai_controlled_actions",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("conversation_id", sa.BigInteger(), nullable=False),
        sa.Column("user_id", sa.BigInteger(), nullable=False),
        sa.Column("channel", sa.String(length=16), nullable=False),
        sa.Column("capability_id", sa.String(length=64), nullable=False),
        sa.Column("action_type", sa.String(length=128), nullable=False),
        sa.Column("selection_handle_hash", sa.String(length=64), nullable=False),
        sa.Column("action_context", sa.JSON(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("consumed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["conversation_id"], ["ai_conversations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("selection_handle_hash", name="uq_ai_controlled_actions_handle_hash"),
    )
    op.create_index(
        "ix_ai_controlled_actions_conversation_user",
        "ai_controlled_actions",
        ["conversation_id", "user_id"],
    )
    op.create_index("ix_ai_controlled_actions_expires_at", "ai_controlled_actions", ["expires_at"])


def downgrade() -> None:
    op.drop_index("ix_ai_controlled_actions_expires_at", table_name="ai_controlled_actions")
    op.drop_index("ix_ai_controlled_actions_conversation_user", table_name="ai_controlled_actions")
    op.drop_table("ai_controlled_actions")
