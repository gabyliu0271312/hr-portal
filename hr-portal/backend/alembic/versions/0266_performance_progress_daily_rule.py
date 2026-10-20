"""Persist progress daily notification rule."""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "0266_performance_progress_daily_rule"
down_revision: Union[str, None] = "0265_performance_reviewer_360_tags"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_DEFAULT = '{"frequency":"daily","interval":1,"days_before":[],"day_kind":"calendar_day","weekdays":[],"time":"18:00","timezone":"person","suppress_non_working_days":false}'


def upgrade() -> None:
    op.add_column(
        "performance_notification_settings",
        sa.Column(
            "progress_daily_rule",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=_DEFAULT,
        ),
    )


def downgrade() -> None:
    op.drop_column("performance_notification_settings", "progress_daily_rule")
