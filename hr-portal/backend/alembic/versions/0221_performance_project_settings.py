"""Persist project configuration used by the project settings page."""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0221_performance_project_settings"
down_revision = "0220_performance_projects"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "performance_projects",
        sa.Column(
            "settings",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
    )


def downgrade() -> None:
    op.drop_column("performance_projects", "settings")
