"""Persist cycle 360 anonymity and live invitation tips configuration."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0319_pm_cycle_360_privacy_policy"
down_revision = "0318_pm_cycle_360_delete_policy"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("performance_cycles", sa.Column("anonymous_360_config", postgresql.JSONB(), nullable=False, server_default='{"enable": false, "anonymous_object": "", "anonymous_low_limit": 0, "reviewer_tag_visibility_mode": "visibleOverLowLimit"}'))
    op.add_column("performance_cycles", sa.Column("invitation_out_of_range_tips_config", postgresql.JSONB(), nullable=False, server_default='{"enable": false, "range_count": 0, "tips": {"zh-CN": "", "en-US": ""}}'))


def downgrade():
    op.drop_column("performance_cycles", "invitation_out_of_range_tips_config")
    op.drop_column("performance_cycles", "anonymous_360_config")
