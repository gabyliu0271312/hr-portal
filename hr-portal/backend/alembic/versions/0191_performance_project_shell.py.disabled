"""Add the minimal project shell required by cycle dependencies."""
from alembic import op
import sqlalchemy as sa
import sqlalchemy.dialects.postgresql

revision = "0191_performance_project_shell"
down_revision = "0190_merge_quality_dispatch_heads"
branch_labels = None
depends_on = None

def upgrade() -> None:
    op.create_table(
        "performance_projects",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("project_ref", sa.String(length=64), nullable=False),
        sa.Column("cycle_ref", sa.String(length=64), sa.ForeignKey("performance_cycles.cycle_ref", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(length=128), nullable=False),
        sa.Column("description", sa.String(length=500), nullable=True),
        sa.Column("status", sa.String(length=16), nullable=False, server_default="DRAFT"),
        sa.Column("administrators", sa.dialects.postgresql.JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("evaluated_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("status IN ('DRAFT', 'STARTED', 'ARCHIVED')", name="ck_performance_project_status"),
        sa.UniqueConstraint("project_ref", name="uq_performance_projects_project_ref"),
    )
    op.create_index("ix_performance_projects_cycle_ref", "performance_projects", ["cycle_ref"])
    op.create_index("ix_performance_projects_cycle_status", "performance_projects", ["cycle_ref", "status"])

def downgrade() -> None:
    op.drop_index("ix_performance_projects_cycle_status", table_name="performance_projects")
    op.drop_index("ix_performance_projects_cycle_ref", table_name="performance_projects")
    op.drop_table("performance_projects")
