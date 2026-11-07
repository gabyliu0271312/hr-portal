"""Persist Feishu focus-group tag colors."""
from alembic import op
import sqlalchemy as sa

revision = "0298_pm_focus_group_tag_colors"
down_revision = "0297_pm_focus_group_feishu_fields"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("performance_focus_groups", sa.Column("tag_color", sa.String(32), nullable=False, server_default="purple-option"))
    op.add_column("performance_focus_groups", sa.Column("text_color", sa.String(32), nullable=False, server_default="#2f0080"))
    op.add_column("performance_focus_groups", sa.Column("bg_color", sa.String(64), nullable=False, server_default="rgba(141,85,237,0.2)"))


def downgrade():
    op.drop_column("performance_focus_groups", "bg_color")
    op.drop_column("performance_focus_groups", "text_color")
    op.drop_column("performance_focus_groups", "tag_color")
