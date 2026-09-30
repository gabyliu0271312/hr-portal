"""Persist metric template dimensions."""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0250_performance_template_dimensions"
down_revision = "0249_performance_metric_types"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "performance_templates",
        sa.Column(
            "dimensions",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
    )


def downgrade() -> None:
    op.drop_column("performance_templates", "dimensions")
