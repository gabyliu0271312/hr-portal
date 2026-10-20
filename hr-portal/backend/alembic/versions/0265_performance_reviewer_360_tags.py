"""Persist the global reviewer 360 tag directory."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0265_performance_reviewer_360_tags"
down_revision = "0264_performance_transfer_prompts"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("performance_other_settings", sa.Column(
        "reviewer_360_tags", postgresql.JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb"),
    ))
    op.add_column("performance_other_settings", sa.Column(
        "reviewer_360_tags_version", sa.Integer(), nullable=False, server_default="0",
    ))


def downgrade():
    op.drop_column("performance_other_settings", "reviewer_360_tags_version")
    op.drop_column("performance_other_settings", "reviewer_360_tags")
