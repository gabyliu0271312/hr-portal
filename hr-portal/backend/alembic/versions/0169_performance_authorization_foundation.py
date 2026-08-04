"""Add performance authorization foundation tables."""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0169_performance_authorization_foundation"
down_revision = "0168_remove_invalid_dataset_relations"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "performance_system_accounts",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("username", sa.String(length=64), nullable=False),
        sa.Column("display_name", sa.String(length=64), nullable=False),
        sa.Column("password_hash", sa.String(length=128), nullable=False),
        sa.Column("account_type", sa.String(length=32), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.CheckConstraint(
            "account_type IN ('PERFORMANCE_SUPER_ADMIN', 'PERFORMANCE_ADMIN')",
            name="ck_performance_system_account_type",
        ),
        sa.UniqueConstraint("username", name="uq_performance_system_accounts_username"),
    )
    op.create_index(
        "uq_performance_system_accounts_single_super_admin",
        "performance_system_accounts",
        ["account_type"],
        unique=True,
        postgresql_where=sa.text("account_type = 'PERFORMANCE_SUPER_ADMIN'"),
    )

    op.create_table(
        "performance_roles",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("code", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=64), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("is_system", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.UniqueConstraint("code", name="uq_performance_roles_code"),
    )

    op.create_table(
        "performance_permissions",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("code", sa.String(length=96), nullable=False),
        sa.Column("name", sa.String(length=96), nullable=False),
        sa.Column("category", sa.String(length=32), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.UniqueConstraint("code", name="uq_performance_permissions_code"),
    )

    op.create_table(
        "performance_role_permissions",
        sa.Column("role_id", sa.BigInteger(), nullable=False),
        sa.Column("permission_id", sa.BigInteger(), nullable=False),
        sa.ForeignKeyConstraint(["permission_id"], ["performance_permissions.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["role_id"], ["performance_roles.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("role_id", "permission_id"),
    )

    op.create_table(
        "performance_role_assignments",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("subject_type", sa.String(length=32), nullable=False),
        sa.Column("subject_id", sa.BigInteger(), nullable=False),
        sa.Column("role_id", sa.BigInteger(), nullable=False),
        sa.Column("scope_type", sa.String(length=16), nullable=False, server_default="GLOBAL"),
        sa.Column("scope_ref", sa.String(length=64), nullable=False, server_default="GLOBAL"),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ends_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.CheckConstraint(
            "subject_type IN ('PORTAL_USER', 'SYSTEM_ACCOUNT')",
            name="ck_performance_role_assignment_subject_type",
        ),
        sa.CheckConstraint(
            "scope_type IN ('GLOBAL', 'ORG', 'PROJECT')",
            name="ck_performance_role_assignment_scope_type",
        ),
        sa.ForeignKeyConstraint(["role_id"], ["performance_roles.id"], ondelete="CASCADE"),
        sa.UniqueConstraint(
            "subject_type",
            "subject_id",
            "role_id",
            "scope_type",
            "scope_ref",
            name="uq_performance_role_assignment_scope",
        ),
    )
    op.create_index(
        "ix_performance_role_assignments_subject",
        "performance_role_assignments",
        ["subject_type", "subject_id", "is_active"],
    )


def downgrade() -> None:
    op.drop_index("ix_performance_role_assignments_subject", table_name="performance_role_assignments")
    op.drop_table("performance_role_assignments")
    op.drop_table("performance_role_permissions")
    op.drop_table("performance_permissions")
    op.drop_table("performance_roles")
    op.drop_index(
        "uq_performance_system_accounts_single_super_admin",
        table_name="performance_system_accounts",
    )
    op.drop_table("performance_system_accounts")