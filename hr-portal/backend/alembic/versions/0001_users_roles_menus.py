"""001 users roles menus

Revision ID: 0001_users_roles_menus
Revises:
Create Date: 2026-05-22

落地 spec data-model.md §一：
- users / roles / user_roles / menus / role_menus
- 含操作权限四件套（can_create/update/delete/export）
- 飞书 SSO 接入位 feishu_user_id（本期不实现，仅留字段）
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0001_users_roles_menus"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ===== users =====
    op.create_table(
        "users",
        sa.Column("id", sa.BigInteger, primary_key=True),
        sa.Column("login_name", sa.String(64), nullable=False, unique=True),
        sa.Column("display_name", sa.String(64), nullable=False),
        sa.Column("email", sa.String(128), nullable=True, unique=True),
        sa.Column("password_hash", sa.String(128), nullable=False),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.text("true")),
        sa.Column("feishu_user_id", sa.String(64), nullable=True, unique=True),
        sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "failed_login_count", sa.Integer, nullable=False, server_default=sa.text("0")
        ),
        sa.Column("locked_until", sa.DateTime(timezone=True), nullable=True),
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
    )

    # ===== roles =====
    op.create_table(
        "roles",
        sa.Column("id", sa.BigInteger, primary_key=True),
        sa.Column("name", sa.String(64), nullable=False, unique=True),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.text("true")),
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
    )

    # ===== user_roles =====
    op.create_table(
        "user_roles",
        sa.Column(
            "user_id", sa.BigInteger, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column(
            "role_id", sa.BigInteger, sa.ForeignKey("roles.id", ondelete="CASCADE"), nullable=False
        ),
        sa.PrimaryKeyConstraint("user_id", "role_id"),
    )

    # ===== menus =====
    op.create_table(
        "menus",
        sa.Column("id", sa.BigInteger, primary_key=True),
        sa.Column("code", sa.String(64), nullable=False, unique=True),
        sa.Column("label", sa.String(64), nullable=False),
        sa.Column(
            "parent_id",
            sa.BigInteger,
            sa.ForeignKey("menus.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("display_order", sa.Integer, nullable=False, server_default=sa.text("0")),
        sa.Column("icon", sa.String(32), nullable=True),
    )

    # ===== role_menus =====
    op.create_table(
        "role_menus",
        sa.Column("id", sa.BigInteger, primary_key=True),
        sa.Column(
            "role_id",
            sa.BigInteger,
            sa.ForeignKey("roles.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "menu_id",
            sa.BigInteger,
            sa.ForeignKey("menus.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "scope_dimension",
            sa.String(16),
            nullable=False,
            server_default=sa.text("'none'"),
        ),  # cost_center / org / none
        sa.Column(
            "can_view", sa.Boolean, nullable=False, server_default=sa.text("true")
        ),
        sa.Column(
            "can_create", sa.Boolean, nullable=False, server_default=sa.text("false")
        ),
        sa.Column(
            "can_update", sa.Boolean, nullable=False, server_default=sa.text("false")
        ),
        sa.Column(
            "can_delete", sa.Boolean, nullable=False, server_default=sa.text("false")
        ),
        sa.Column(
            "can_export", sa.Boolean, nullable=False, server_default=sa.text("false")
        ),
        sa.UniqueConstraint("role_id", "menu_id", name="uq_role_menu"),
        sa.CheckConstraint(
            "scope_dimension IN ('cost_center', 'org', 'none')",
            name="ck_role_menu_scope_dimension",
        ),
    )

    op.create_index("idx_users_login_name", "users", ["login_name"])
    op.create_index("idx_users_feishu", "users", ["feishu_user_id"])
    op.create_index("idx_menus_parent", "menus", ["parent_id"])
    op.create_index("idx_role_menus_role", "role_menus", ["role_id"])


def downgrade() -> None:
    op.drop_index("idx_role_menus_role", table_name="role_menus")
    op.drop_index("idx_menus_parent", table_name="menus")
    op.drop_index("idx_users_feishu", table_name="users")
    op.drop_index("idx_users_login_name", table_name="users")
    op.drop_table("role_menus")
    op.drop_table("menus")
    op.drop_table("user_roles")
    op.drop_table("roles")
    op.drop_table("users")