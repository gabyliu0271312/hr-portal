"""Persist metric template score method."""

from alembic import op
import sqlalchemy as sa

revision = "0247_performance_template_score_method"
down_revision = "0246_performance_template_kind"
branch_labels = None
depends_on = None

def upgrade() -> None:
    op.add_column("performance_templates", sa.Column("score_method", sa.String(32), nullable=False, server_default="manual"))
    op.create_check_constraint("ck_performance_template_score_method", "performance_templates", "score_method IN ('manual', 'dimension_sum', 'dimension_weighted', 'custom_formula')")

def downgrade() -> None:
    op.drop_constraint("ck_performance_template_score_method", "performance_templates", type_="check")
    op.drop_column("performance_templates", "score_method")
