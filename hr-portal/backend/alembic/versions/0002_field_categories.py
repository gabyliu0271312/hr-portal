"""002 field categories

落地 spec data-model.md 字段分类部分：
- field_categories：分类定义
- field_category_assignments：(category, table, column) 分配
- user_visible_categories / role_visible_categories：白名单
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0002_field_categories"
down_revision: Union[str, None] = "0001_users_roles_menus"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "field_categories",
        sa.Column("id", sa.BigInteger, primary_key=True),
        sa.Column("name", sa.String(64), nullable=False, unique=True),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column(
            "is_sensitive",
            sa.Boolean,
            nullable=False,
            server_default=sa.text("false"),
            comment="是否敏感（决定脱敏图标和文案）",
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )

    op.create_table(
        "field_category_assignments",
        sa.Column("id", sa.BigInteger, primary_key=True),
        sa.Column(
            "category_id",
            sa.BigInteger,
            sa.ForeignKey("field_categories.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("table_name", sa.String(64), nullable=False),
        sa.Column("column_name", sa.String(64), nullable=False),
        sa.UniqueConstraint(
            "category_id",
            "table_name",
            "column_name",
            name="uq_field_cat_assignment",
        ),
    )

    op.create_table(
        "user_visible_categories",
        sa.Column(
            "user_id",
            sa.BigInteger,
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "category_id",
            sa.BigInteger,
            sa.ForeignKey("field_categories.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("user_id", "category_id"),
    )

    op.create_table(
        "role_visible_categories",
        sa.Column(
            "role_id",
            sa.BigInteger,
            sa.ForeignKey("roles.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "category_id",
            sa.BigInteger,
            sa.ForeignKey("field_categories.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("role_id", "category_id"),
    )

    op.create_index(
        "idx_field_cat_assign_table_col",
        "field_category_assignments",
        ["table_name", "column_name"],
    )


def downgrade() -> None:
    op.drop_index(
        "idx_field_cat_assign_table_col", table_name="field_category_assignments"
    )
    op.drop_table("role_visible_categories")
    op.drop_table("user_visible_categories")
    op.drop_table("field_category_assignments")
    op.drop_table("field_categories")