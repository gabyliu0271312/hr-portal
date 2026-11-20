"""Persist the cycle policy for revoking effective 360 invitations."""
from alembic import op
import sqlalchemy as sa

revision = "0318_pm_cycle_360_delete_policy"
down_revision = "0317_performance_bu_snapshot"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("performance_cycles", sa.Column("allow_delete_360", sa.Boolean(), nullable=False, server_default=sa.false()))


def downgrade():
    op.drop_column("performance_cycles", "allow_delete_360")
