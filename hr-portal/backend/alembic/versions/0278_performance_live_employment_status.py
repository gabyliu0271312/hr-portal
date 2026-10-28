"""Separate live employment status from cycle person snapshots."""
from alembic import op
import sqlalchemy as sa

revision = "0278_performance_live_status"
down_revision = "0277_performance_standard_position"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("performance_authorization_snapshot_people", sa.Column("live_employment_status", sa.String(64), nullable=True))
    op.execute("UPDATE performance_authorization_snapshot_people SET live_employment_status = employment_status")


def downgrade():
    op.drop_column("performance_authorization_snapshot_people", "live_employment_status")
