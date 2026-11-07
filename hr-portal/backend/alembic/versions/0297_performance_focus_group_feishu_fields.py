"""Add Feishu-aligned fields to performance focus groups."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0297_pm_focus_group_feishu_fields"
down_revision = "0296_pm_focus_group_form_fields"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("performance_focus_groups", sa.Column("en_name", sa.String(length=128), nullable=False, server_default=""))
    op.add_column("performance_focus_groups", sa.Column("followee_user_ids", postgresql.JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb")))
    op.add_column("performance_focus_groups", sa.Column("view_permission", sa.Integer(), nullable=False, server_default="1"))
    op.add_column("performance_focus_groups", sa.Column("scope_setting_mode", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("performance_focus_groups", sa.Column("scope", postgresql.JSONB(), nullable=True))
    op.add_column("performance_focus_groups", sa.Column("show_group_tag", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("performance_focus_groups", sa.Column("is_communicate_time", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("performance_focus_groups", sa.Column("start_time", sa.String(length=32), nullable=True))
    op.add_column("performance_focus_groups", sa.Column("end_time", sa.String(length=32), nullable=True))
    op.create_check_constraint(
        "ck_performance_focus_group_scope_setting_mode",
        "performance_focus_groups",
        "scope_setting_mode IN (0, 1, 2)",
    )
    op.create_check_constraint(
        "ck_performance_focus_group_communication_time",
        "performance_focus_groups",
        "is_communicate_time = false OR (start_time IS NOT NULL AND end_time IS NOT NULL AND start_time < end_time)",
    )


def downgrade():
    op.drop_constraint("ck_performance_focus_group_communication_time", "performance_focus_groups", type_="check")
    op.drop_constraint("ck_performance_focus_group_scope_setting_mode", "performance_focus_groups", type_="check")
    op.drop_column("performance_focus_groups", "end_time")
    op.drop_column("performance_focus_groups", "start_time")
    op.drop_column("performance_focus_groups", "is_communicate_time")
    op.drop_column("performance_focus_groups", "show_group_tag")
    op.drop_column("performance_focus_groups", "scope")
    op.drop_column("performance_focus_groups", "scope_setting_mode")
    op.drop_column("performance_focus_groups", "view_permission")
    op.drop_column("performance_focus_groups", "followee_user_ids")
    op.drop_column("performance_focus_groups", "en_name")
