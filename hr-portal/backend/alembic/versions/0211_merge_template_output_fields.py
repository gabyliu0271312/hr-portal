"""Add output_fields to merge templates for output-column ordering and filtering."""
from alembic import op
import sqlalchemy as sa


revision = "0211_merge_template_output_fields"
down_revision = "0210_merge_source_mapping_source_fields"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "merge_templates",
        sa.Column("output_fields", sa.JSON(), nullable=False, server_default="[]"),
    )


def downgrade() -> None:
    op.drop_column("merge_templates", "output_fields")
