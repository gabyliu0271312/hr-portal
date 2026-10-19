"""Persist irreversible per-person performance result openings."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = "0259_performance_result_openings"
down_revision = "0258_performance_cycle_project_managers"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "performance_result_openings",
        sa.Column("id", sa.BigInteger(), sa.Identity(), primary_key=True),
        sa.Column("project_id", sa.BigInteger(), sa.ForeignKey("performance_projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("cycle_ref", sa.String(length=64), nullable=False),
        sa.Column("employee_no", sa.String(length=64), nullable=False),
        sa.Column("opened_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("opened_by_type", sa.String(length=32), nullable=False),
        sa.Column("opened_by_ref", sa.String(length=64), nullable=False),
        sa.Column("result_version", JSONB(), nullable=False),
        sa.UniqueConstraint("project_id", "employee_no", name="uq_performance_result_opening_person"),
    )
    op.create_index("ix_performance_result_openings_cycle", "performance_result_openings", ["cycle_ref", "employee_no"])


def downgrade():
    op.drop_index("ix_performance_result_openings_cycle", table_name="performance_result_openings")
    op.drop_table("performance_result_openings")
