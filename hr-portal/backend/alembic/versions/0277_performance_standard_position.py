"""Add standard position to performance person snapshots."""
from alembic import op
import sqlalchemy as sa

revision = "0277_performance_standard_position"
down_revision = "0276_standard_field_direct_identity"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("performance_authorization_snapshot_people", sa.Column("standard_position", sa.String(256), nullable=True))
    op.add_column("performance_project_members", sa.Column("standard_position", sa.String(256), nullable=True))


def downgrade():
    op.drop_column("performance_project_members", "standard_position")
    op.drop_column("performance_authorization_snapshot_people", "standard_position")
