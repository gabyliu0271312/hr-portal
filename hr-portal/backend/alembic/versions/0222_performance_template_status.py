"""Persist performance template availability state."""

from alembic import op
import sqlalchemy as sa

revision = "0222_performance_template_status"
down_revision = "0221_performance_project_settings"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "performance_templates",
        sa.Column("status", sa.String(length=16), nullable=False, server_default="inactive"),
    )
    op.create_check_constraint(
        "ck_performance_templates_status",
        "performance_templates",
        "status IN ('active', 'inactive')",
    )
    op.execute("UPDATE performance_templates SET status = 'active'")


def downgrade() -> None:
    op.drop_constraint("ck_performance_templates_status", "performance_templates", type_="check")
    op.drop_column("performance_templates", "status")
