"""Distinguish unfinished performance templates from ready templates."""
from alembic import op

revision = "0283_performance_template_draft"
down_revision = "0282_master_entity_records"
branch_labels = None
depends_on = None


def upgrade():
    op.drop_constraint("ck_performance_templates_status", "performance_templates", type_="check")
    op.create_check_constraint(
        "ck_performance_templates_status",
        "performance_templates",
        "status IN ('DRAFT', 'active', 'inactive')",
    )


def downgrade():
    op.execute("UPDATE performance_templates SET status = 'inactive' WHERE status = 'DRAFT'")
    op.drop_constraint("ck_performance_templates_status", "performance_templates", type_="check")
    op.create_check_constraint(
        "ck_performance_templates_status",
        "performance_templates",
        "status IN ('active', 'inactive')",
    )
