"""Add detailed performance cycle period subtype."""
from alembic import op
import sqlalchemy as sa

revision = "0202_performance_cycle_period_subtype"
down_revision = "0201_push_target_mapping_component"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("performance_cycles", sa.Column("period_subtype", sa.String(16), nullable=True))


def downgrade() -> None:
    op.drop_column("performance_cycles", "period_subtype")
