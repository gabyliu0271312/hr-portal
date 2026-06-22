"""0043 删除全局字段字典 + table_columns.global_field_id + 菜单

全局字段从未投入使用(库内 0 行、0 认领),与统一权限方案(005)无关:
L2 数据范围读物理列自身 scope_role,L3 敏感判定走「字段分类」直接挂分类。
保留 field_category_tool_whitelist(补偿金/证明工具依赖,归属迁至 field_category 模块,表不动)。
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "0043_drop_global_fields"
down_revision: Union[str, None] = "0042_scope_strategy"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_column("table_columns", "global_field_id")
    op.drop_table("global_fields")
    # 删菜单及其角色授权(子查询定位 menu_id)
    op.execute(
        "DELETE FROM role_menus WHERE menu_id IN "
        "(SELECT id FROM menus WHERE code = 'system.global_fields')"
    )
    op.execute("DELETE FROM menus WHERE code = 'system.global_fields'")


def downgrade() -> None:
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
    op.add_column(
        "table_columns",
        sa.Column("global_field_id", sa.BigInteger(), nullable=True),
    )