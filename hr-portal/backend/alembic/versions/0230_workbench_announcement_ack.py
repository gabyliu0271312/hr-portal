"""0230 performance workbench announcement acknowledgement"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0230_workbench_announcement_ack"
down_revision: Union[str, None] = "0229_performance_workbench_settings"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "performance_workbench_announcements",
        sa.Column("require_ack", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )


def downgrade() -> None:
    op.drop_column("performance_workbench_announcements", "require_ack")
