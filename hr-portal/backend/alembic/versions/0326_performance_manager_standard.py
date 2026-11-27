"""Persist manager standard field settings independently."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0326_performance_manager_standard"
down_revision = "0325_performance_report_notes"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "performance_manager_standard_settings",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("manager_standard", sa.String(64), nullable=False, server_default="inservice_direct_underling"),
        sa.Column("specific_employee_types", postgresql.JSONB(), nullable=False, server_default="[]"),
        sa.Column("updated_by_type", sa.String(32), nullable=True),
        sa.Column("updated_by_ref", sa.String(64), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("id = 1", name="ck_performance_manager_standard_singleton"),
        sa.CheckConstraint(
            "manager_standard IN ('inservice_direct_underling', 'specific_employee_type_underling')",
            name="ck_performance_manager_standard_value",
        ),
        sa.CheckConstraint(
            "jsonb_typeof(specific_employee_types) = 'array' AND "
            "((manager_standard = 'inservice_direct_underling' AND jsonb_array_length(specific_employee_types) = 0) OR "
            "(manager_standard = 'specific_employee_type_underling' AND jsonb_array_length(specific_employee_types) > 0))",
            name="ck_performance_manager_standard_types",
        ),
    )


def downgrade():
    op.drop_table("performance_manager_standard_settings")
