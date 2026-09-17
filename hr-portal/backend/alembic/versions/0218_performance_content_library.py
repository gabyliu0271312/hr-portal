"""Add template-level shared assessment content library."""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0218_performance_content_library"
down_revision = "0217_merge_performance_and_report_heads"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "performance_template_workflows",
        sa.Column(
            "content_library",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
    )


def downgrade() -> None:
    op.drop_column("performance_template_workflows", "content_library")
