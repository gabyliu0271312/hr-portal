"""0022 新增 push_targets（对外推送目标配置）"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "0022_push_targets"
down_revision: Union[str, None] = "0021_reg_period_source"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "push_targets",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("source_table", sa.String(64), nullable=False),
        sa.Column("name", sa.String(128), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("push_type", sa.String(32), nullable=False),
        sa.Column("settings", sa.JSON(), nullable=False, server_default="{}"),
        sa.Column("secrets_encrypted", sa.JSON(), nullable=False, server_default="{}"),
        sa.Column("field_mappings", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("last_push_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_status", sa.String(16), nullable=False, server_default="pending"),
        sa.Column("last_rows", sa.Integer(), nullable=True),
        sa.Column("last_message", sa.Text(), nullable=True),
        sa.Column("created_by", sa.BigInteger(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_push_targets_source_table", "push_targets", ["source_table"])


def downgrade() -> None:
    op.drop_index("ix_push_targets_source_table", table_name="push_targets")
    op.drop_table("push_targets")
