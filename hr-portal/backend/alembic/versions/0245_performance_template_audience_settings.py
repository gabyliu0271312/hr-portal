"""Persist metric template audience settings."""

from alembic import op
import sqlalchemy as sa

revision = "0245_performance_template_audience_settings"
down_revision = "0244_performance_review_question_remark"
branch_labels = None
depends_on = None


def _columns() -> set[str]:
    return {column["name"] for column in sa.inspect(op.get_bind()).get_columns("performance_templates")}


def upgrade() -> None:
    if "audience_settings_enabled" not in _columns():
        op.add_column(
            "performance_templates",
            sa.Column("audience_settings_enabled", sa.Boolean(), nullable=False, server_default=sa.false()),
        )
        op.alter_column("performance_templates", "audience_settings_enabled", server_default=None)


def downgrade() -> None:
    if "audience_settings_enabled" in _columns():
        op.drop_column("performance_templates", "audience_settings_enabled")
