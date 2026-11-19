"""Add BU to performance person snapshots without backfilling historical data."""
from alembic import op
import sqlalchemy as sa

revision = "0317_performance_bu_snapshot"
down_revision = "0316_cc_tree_parent_code"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("performance_authorization_snapshot_people", sa.Column("bu", sa.Text(), nullable=True))
    op.add_column("performance_project_members", sa.Column("bu", sa.Text(), nullable=True))


def downgrade():
    op.drop_column("performance_project_members", "bu")
    op.drop_column("performance_authorization_snapshot_people", "bu")
