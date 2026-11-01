"""Freeze the position level when a performance result is opened."""
from alembic import op
import sqlalchemy as sa

revision = "0288_pm_published_level"
down_revision = "0287_field_groups"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("performance_result_openings", sa.Column("published_position_level", sa.String(128), nullable=True))


def downgrade():
    if op.get_bind().scalar(sa.text("SELECT 1 FROM performance_result_openings WHERE published_position_level IS NOT NULL LIMIT 1")) is not None:
        raise RuntimeError("已有发布职级快照，不能降级删除历史结果证据")
    op.drop_column("performance_result_openings", "published_position_level")
