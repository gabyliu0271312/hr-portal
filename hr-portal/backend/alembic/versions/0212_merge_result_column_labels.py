"""Persist display labels for merged result columns."""
from alembic import op
import sqlalchemy as sa

revision = "0212_merge_result_column_labels"
down_revision = "0211_merge_template_output_fields"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("merge_preview_runs", sa.Column("column_labels_snapshot", sa.JSON(), nullable=False, server_default="{}"))
    op.add_column("merge_result_batches", sa.Column("column_labels_snapshot", sa.JSON(), nullable=False, server_default="{}"))


def downgrade() -> None:
    op.drop_column("merge_result_batches", "column_labels_snapshot")
    op.drop_column("merge_preview_runs", "column_labels_snapshot")
