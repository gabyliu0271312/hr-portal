"""Persist departure dates in performance snapshots."""
from alembic import op
import sqlalchemy as sa

revision = "0189_performance_snapshot_departure_date"
down_revision = "0188_performance_cycle_lifecycle_job"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("performance_authorization_snapshot_people", sa.Column("departure_date", sa.Date(), nullable=True))


def downgrade() -> None:
    op.drop_column("performance_authorization_snapshot_people", "departure_date")
