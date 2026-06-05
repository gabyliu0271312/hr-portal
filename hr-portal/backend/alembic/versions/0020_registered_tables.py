"""0020 新增 registered_tables（动态视图注册中心）"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "0020_registered_tables"
down_revision: Union[str, None] = "0019_allocation_schemes"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "registered_tables",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("table_name", sa.String(64), nullable=False),
        sa.Column("table_label", sa.String(128), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("is_period", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("period_col", sa.String(64), nullable=False, server_default="月份"),
        sa.Column("entity_keys", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("is_builtin", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("is_result_table", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("icon", sa.String(64), nullable=False, server_default="Grid"),
        sa.Column("display_order", sa.Integer(), nullable=False, server_default="999"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("table_name", name="uq_registered_table_name"),
    )


def downgrade() -> None:
    op.drop_table("registered_tables")
