"""Persist todo task notification rule."""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "0261_performance_todo_notification_rule"
down_revision: Union[str, None] = "0260_performance_other_settings"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_DEFAULT = '{"frequency":"daily","interval":1,"days_before":[],"day_kind":"calendar_day","weekdays":[],"time":"10:00","timezone":"person","suppress_non_working_days":false}'


def upgrade() -> None:
    op.add_column(
        "performance_notification_settings",
        sa.Column(
            "todo_task_rule",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=_DEFAULT,
        ),
    )


def downgrade() -> None:
    op.drop_column("performance_notification_settings", "todo_task_rule")
