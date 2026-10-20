"""Persist performance other settings."""
from alembic import op
import sqlalchemy as sa

revision = "0260_performance_other_settings"
down_revision = "0259_performance_result_openings"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "performance_other_settings",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("calibration_authorization_outside_direct_reports_enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("calibration_import_enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("performance_coefficient_enabled", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("reviewer_360_tags_enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("manual_result_opening_enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("overdue_single_submission_enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("overdue_voluntary_360_submission_enabled", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("cycle_overdue_submission_override_enabled", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("updated_by_type", sa.String(32), nullable=True),
        sa.Column("updated_by_ref", sa.String(64), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("id = 1", name="ck_performance_other_settings_singleton"),
    )


def downgrade():
    op.drop_table("performance_other_settings")
