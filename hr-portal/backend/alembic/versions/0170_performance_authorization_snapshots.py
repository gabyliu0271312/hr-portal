"""Add performance authorization snapshots and dynamic identity assignments.

Revision ID: 0170_performance_authorization_snapshots
Revises: 0169_performance_authorization_foundation
Create Date: 2026-08-04
"""
from alembic import op
import sqlalchemy as sa


revision = "0170_performance_authorization_snapshots"
down_revision = "0169_performance_authorization_foundation"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "performance_authorization_snapshots",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("cycle_ref", sa.String(length=64), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False, server_default="DRAFT"),
        sa.Column("locked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_synced_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.CheckConstraint(
            "status IN ('DRAFT', 'LOCKED')",
            name="ck_performance_authorization_snapshot_status",
        ),
        sa.UniqueConstraint("cycle_ref", name="uq_performance_authorization_snapshots_cycle_ref"),
    )
    op.create_table(
        "performance_authorization_snapshot_people",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("snapshot_id", sa.BigInteger(), nullable=False),
        sa.Column("source_roster_id", sa.BigInteger(), nullable=True),
        sa.Column("employee_no", sa.String(length=64), nullable=False),
        sa.Column("display_name", sa.String(length=128), nullable=False),
        sa.Column("organization_ref", sa.String(length=128), nullable=True),
        sa.Column("direct_manager_employee_no", sa.String(length=64), nullable=True),
        sa.Column("direct_manager_source_value", sa.String(length=256), nullable=True),
        sa.Column("hrbp_employee_no", sa.String(length=64), nullable=True),
        sa.Column("hrbp_source_value", sa.String(length=256), nullable=True),
        sa.Column("employment_status", sa.String(length=64), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(
            ["snapshot_id"],
            ["performance_authorization_snapshots.id"],
            ondelete="CASCADE",
        ),
        sa.UniqueConstraint(
            "snapshot_id",
            "employee_no",
            name="uq_performance_authorization_snapshot_person",
        ),
    )
    op.create_index(
        "ix_performance_authorization_snapshot_people_manager",
        "performance_authorization_snapshot_people",
        ["snapshot_id", "direct_manager_employee_no"],
    )
    op.create_index(
        "ix_performance_authorization_snapshot_people_hrbp",
        "performance_authorization_snapshot_people",
        ["snapshot_id", "hrbp_employee_no"],
    )
    op.create_table(
        "performance_dynamic_identity_assignments",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("snapshot_id", sa.BigInteger(), nullable=False),
        sa.Column("actor_type", sa.String(length=32), nullable=False),
        sa.Column("actor_ref", sa.String(length=64), nullable=False),
        sa.Column("identity_type", sa.String(length=32), nullable=False),
        sa.Column("target_type", sa.String(length=16), nullable=False),
        sa.Column("target_ref", sa.String(length=64), nullable=False),
        sa.Column("source_type", sa.String(length=32), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.CheckConstraint(
            "actor_type IN ('EMPLOYEE', 'PORTAL_USER', 'SYSTEM_ACCOUNT', 'PERFORMANCE_ROLE')",
            name="ck_performance_dynamic_identity_actor_type",
        ),
        sa.CheckConstraint(
            "identity_type IN ('SELF', 'DIRECT_MANAGER', 'INDIRECT_MANAGER', 'HRBP', "
            "'REVIEWER_360', 'CALIBRATOR', 'PROJECT_ADMIN', 'APPEAL_HANDLER')",
            name="ck_performance_dynamic_identity_type",
        ),
        sa.CheckConstraint(
            "target_type IN ('EMPLOYEE', 'ORG', 'PROJECT')",
            name="ck_performance_dynamic_identity_target_type",
        ),
        sa.CheckConstraint(
            "source_type IN ('SYNC', 'MANUAL', 'CONFIGURATION')",
            name="ck_performance_dynamic_identity_source_type",
        ),
        sa.ForeignKeyConstraint(
            ["snapshot_id"],
            ["performance_authorization_snapshots.id"],
            ondelete="CASCADE",
        ),
        sa.UniqueConstraint(
            "snapshot_id",
            "actor_type",
            "actor_ref",
            "identity_type",
            "target_type",
            "target_ref",
            name="uq_performance_dynamic_identity_scope",
        ),
    )
    op.create_index(
        "ix_performance_dynamic_identity_actor",
        "performance_dynamic_identity_assignments",
        ["snapshot_id", "actor_type", "actor_ref", "identity_type", "is_active"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_performance_dynamic_identity_actor",
        table_name="performance_dynamic_identity_assignments",
    )
    op.drop_table("performance_dynamic_identity_assignments")
    op.drop_index(
        "ix_performance_authorization_snapshot_people_hrbp",
        table_name="performance_authorization_snapshot_people",
    )
    op.drop_index(
        "ix_performance_authorization_snapshot_people_manager",
        table_name="performance_authorization_snapshot_people",
    )
    op.drop_table("performance_authorization_snapshot_people")
    op.drop_table("performance_authorization_snapshots")