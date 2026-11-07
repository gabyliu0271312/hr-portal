"""Add focus-group create-form fields (description/activity_ids/roles)."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0296_pm_focus_group_form_fields"
down_revision = "0295_pm_hrbp_invisible_rules"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("performance_focus_groups", sa.Column("description", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")))
    op.add_column("performance_focus_groups", sa.Column("activity_ids", postgresql.JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb")))
    op.add_column("performance_focus_groups", sa.Column("roles_of_managing_scope", postgresql.JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb")))


def downgrade():
    op.drop_column("performance_focus_groups", "roles_of_managing_scope")
    op.drop_column("performance_focus_groups", "activity_ids")
    op.drop_column("performance_focus_groups", "description")
