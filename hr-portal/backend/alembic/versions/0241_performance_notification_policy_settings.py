"""Persist performance notification policy settings."""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0241_performance_notification_policy_settings"
down_revision: Union[str, None] = "0240_performance_organization_levels"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_TABLE = "performance_notification_settings"


def upgrade() -> None:
    op.add_column(_TABLE, sa.Column("calibration_delivery_mode", sa.String(32), nullable=False, server_default="realtime"))
    op.add_column(_TABLE, sa.Column("result_change_notification_scope", sa.String(32), nullable=False, server_default="final_score_grade"))
    for name in ("todo_task_notification_enabled", "progress_daily_notification_enabled", "stage_start_notification_enabled"):
        op.add_column(_TABLE, sa.Column(name, sa.Boolean(), nullable=False, server_default=sa.true()))
    op.create_check_constraint(
        "ck_performance_notification_calibration_delivery",
        _TABLE,
        "calibration_delivery_mode IN ('realtime', 'after_calibration')",
    )
    op.create_check_constraint(
        "ck_performance_notification_result_scope",
        _TABLE,
        "result_change_notification_scope IN ('final_score_grade', 'any_content')",
    )


def downgrade() -> None:
    op.drop_constraint("ck_performance_notification_result_scope", _TABLE, type_="check")
    op.drop_constraint("ck_performance_notification_calibration_delivery", _TABLE, type_="check")
    for name in ("stage_start_notification_enabled", "progress_daily_notification_enabled", "todo_task_notification_enabled", "result_change_notification_scope", "calibration_delivery_mode"):
        op.drop_column(_TABLE, name)
