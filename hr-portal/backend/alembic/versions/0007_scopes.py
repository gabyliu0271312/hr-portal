"""0007 scopes & tree paths

- 给 cost_center_tree / org_tree 加 path 列（KD-3：路径串展开）
- 新增 scope_tags / scope_tag_selections / user_scope_tags
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0007_scopes"
down_revision: Union[str, None] = "0006_scheduler"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 给两棵树加 path
    op.add_column("cost_center_tree", sa.Column("path", sa.String(1024), nullable=True))
    op.add_column("org_tree", sa.Column("path", sa.String(1024), nullable=True))
    op.create_index("ix_cc_tree_path", "cost_center_tree", ["path"])
    op.create_index("ix_org_tree_path", "org_tree", ["path"])

    # 给字段元数据加 scope_role（标识列在权限体系里的角色）
    op.add_column("table_columns", sa.Column("scope_role", sa.String(32), nullable=True))

    op.create_table(
        "scope_tags",
        sa.Column("id", sa.BigInteger, primary_key=True),
        sa.Column("name", sa.String(64), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("dimension", sa.String(16), nullable=False),
        sa.Column("sub_dimension", sa.String(32), nullable=True),
        sa.Column("is_unlimited", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.UniqueConstraint("name", name="uq_scope_tag_name"),
        sa.CheckConstraint(
            "dimension IN ('cost_center', 'org')", name="ck_scope_tag_dimension"
        ),
        sa.CheckConstraint(
            "sub_dimension IS NULL OR sub_dimension IN "
            "('organization', 'employment_type', 'employment_entity')",
            name="ck_scope_tag_sub_dimension",
        ),
    )

    op.create_table(
        "scope_tag_selections",
        sa.Column("id", sa.BigInteger, primary_key=True),
        sa.Column(
            "tag_id",
            sa.BigInteger,
            sa.ForeignKey("scope_tags.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("node_id", sa.BigInteger, nullable=True),
        sa.Column("value_text", sa.String(128), nullable=True),
        sa.Column(
            "include_descendants",
            sa.Boolean,
            nullable=False,
            server_default=sa.text("false"),
        ),
    )
    op.create_index("ix_scope_tag_sel_tag", "scope_tag_selections", ["tag_id"])

    op.create_table(
        "user_scope_tags",
        sa.Column(
            "user_id",
            sa.BigInteger,
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column(
            "tag_id",
            sa.BigInteger,
            sa.ForeignKey("scope_tags.id", ondelete="CASCADE"),
            primary_key=True,
        ),
    )


def downgrade() -> None:
    op.drop_table("user_scope_tags")
    op.drop_index("ix_scope_tag_sel_tag", table_name="scope_tag_selections")
    op.drop_table("scope_tag_selections")
    op.drop_table("scope_tags")
    op.drop_column("table_columns", "scope_role")
    op.drop_index("ix_org_tree_path", table_name="org_tree")
    op.drop_index("ix_cc_tree_path", table_name="cost_center_tree")
    op.drop_column("org_tree", "path")
    op.drop_column("cost_center_tree", "path")
