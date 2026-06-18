"""0038 AI conversations (multi-turn session state)"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0038_ai_conversations"
down_revision: Union[str, None] = "0037_fix_cost_class_codes"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "ai_conversations",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("user_id", sa.BigInteger(), nullable=False),
        sa.Column("channel", sa.String(16), nullable=False, server_default="web"),
        sa.Column("active_capability_id", sa.String(64), nullable=True),
        sa.Column("state", sa.JSON(), nullable=False, server_default="{}"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
    )
    op.create_index(
        "ix_ai_conversations_user_updated",
        "ai_conversations",
        ["user_id", "updated_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_ai_conversations_user_updated", table_name="ai_conversations")
    op.drop_table("ai_conversations")
