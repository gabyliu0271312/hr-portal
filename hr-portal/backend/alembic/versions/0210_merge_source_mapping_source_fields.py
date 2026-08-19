"""Persist parsed source fields for merge mappings."""

from alembic import op
import sqlalchemy as sa


revision = "0210_merge_source_mapping_source_fields"
down_revision = "0209_performance_templates"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "merge_source_mappings",
        sa.Column("source_fields", sa.JSON(), nullable=False, server_default="[]"),
    )


def downgrade() -> None:
    op.drop_column("merge_source_mappings", "source_fields")
