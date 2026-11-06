"""Store live HRBP invisible scope rules without altering cycle snapshots."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0295_pm_hrbp_invisible_rules"
down_revision = "0294_pm_person_info_guard"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("performance_other_permission_settings", sa.Column("hrbp_invisible_rules", postgresql.JSONB(), nullable=True))


def downgrade():
    op.drop_column("performance_other_permission_settings", "hrbp_invisible_rules")
