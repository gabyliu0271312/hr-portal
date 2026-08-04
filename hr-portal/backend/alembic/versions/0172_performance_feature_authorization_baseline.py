"""Add assignment origin metadata for performance feature authorization.

Revision ID: 0172_performance_feature_authorization_baseline
Revises: 0171_performance_object_authorization_audit
Create Date: 2026-08-04
"""
from alembic import op
import sqlalchemy as sa


revision = "0172_performance_feature_authorization_baseline"
down_revision = "0171_performance_object_authorization_audit"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "performance_dynamic_identity_assignments",
        sa.Column("assigned_by_type", sa.String(length=32), nullable=True),
    )
    op.add_column(
        "performance_dynamic_identity_assignments",
        sa.Column("assigned_by_ref", sa.String(length=64), nullable=True),
    )
    op.create_check_constraint(
        "ck_performance_dynamic_identity_assigned_by_pair",
        "performance_dynamic_identity_assignments",
        "(assigned_by_type IS NULL) = (assigned_by_ref IS NULL)",
    )
    op.create_check_constraint(
        "ck_performance_dynamic_identity_assigned_by_type",
        "performance_dynamic_identity_assignments",
        "assigned_by_type IS NULL OR assigned_by_type IN "
        "('EMPLOYEE', 'PORTAL_USER', 'SYSTEM_ACCOUNT', 'PERFORMANCE_ROLE')",
    )
    op.create_index(
        "ix_performance_dynamic_identity_visibility",
        "performance_dynamic_identity_assignments",
        [
            "snapshot_id",
            "identity_type",
            "target_type",
            "target_ref",
            "assigned_by_type",
            "assigned_by_ref",
            "is_active",
        ],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_performance_dynamic_identity_visibility",
        table_name="performance_dynamic_identity_assignments",
    )
    op.drop_constraint(
        "ck_performance_dynamic_identity_assigned_by_type",
        "performance_dynamic_identity_assignments",
        type_="check",
    )
    op.drop_constraint(
        "ck_performance_dynamic_identity_assigned_by_pair",
        "performance_dynamic_identity_assignments",
        type_="check",
    )
    op.drop_column("performance_dynamic_identity_assignments", "assigned_by_ref")
    op.drop_column("performance_dynamic_identity_assignments", "assigned_by_type")