"""Separate metric templates from performance workflow templates."""

from alembic import op
import sqlalchemy as sa

revision = "0246_performance_template_kind"
down_revision = "0245_performance_template_audience_settings"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("performance_templates", sa.Column("template_kind", sa.String(16), nullable=False, server_default="performance"))
    op.create_check_constraint("ck_performance_template_kind", "performance_templates", "template_kind IN ('performance', 'metric')")


def downgrade() -> None:
    op.drop_constraint("ck_performance_template_kind", "performance_templates", type_="check")
    op.drop_column("performance_templates", "template_kind")
