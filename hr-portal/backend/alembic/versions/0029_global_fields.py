"""0029 全局字段字典 + 授权工具白名单 + table_columns.global_field_id"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "0029_global_fields"
down_revision: Union[str, None] = "0028_scope_exempt"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "global_fields",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("code", sa.String(64), nullable=False),
        sa.Column("label", sa.String(128), nullable=False),
        sa.Column("data_type", sa.String(16), nullable=False, server_default="string"),
        sa.Column("agg_role", sa.String(16), nullable=False, server_default="dimension"),
        sa.Column("scope_role", sa.String(32), nullable=True),
        sa.Column("category_id", sa.BigInteger(), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("code", name="uq_global_field_code"),
        sa.ForeignKeyConstraint(["category_id"], ["field_categories.id"], ondelete="SET NULL"),
    )

    op.create_table(
        "field_category_tool_whitelist",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("category_id", sa.BigInteger(), nullable=False),
        sa.Column("tool_key", sa.String(64), nullable=False),
        sa.UniqueConstraint("category_id", "tool_key", name="uq_field_cat_tool"),
        sa.ForeignKeyConstraint(["category_id"], ["field_categories.id"], ondelete="CASCADE"),
    )

    op.add_column(
        "table_columns",
        sa.Column("global_field_id", sa.BigInteger(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("table_columns", "global_field_id")
    op.drop_table("field_category_tool_whitelist")
    op.drop_table("global_fields")
