"""replace legacy database exposure mode with realtime/snapshot modes"""
from alembic import op

revision = "0160_push_database_modes"
down_revision = "0159"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("UPDATE push_targets SET push_type = 'db_snapshot' WHERE push_type = 'db_expose'")


def downgrade() -> None:
    op.execute("UPDATE push_targets SET push_type = 'db_expose' WHERE push_type = 'db_snapshot'")
    op.execute("UPDATE push_targets SET push_type = 'db_expose' WHERE push_type = 'db_realtime'")
