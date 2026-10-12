"""0231 performance workbench announcement selection refs"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0231_workbench_announcement_refs"
down_revision: Union[str, None] = "0230_workbench_announcement_ack"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "performance_workbench_announcements",
        sa.Column("cycle_ref", sa.String(length=64), nullable=True),
    )
    op.add_column(
        "performance_workbench_announcements",
        sa.Column("visibility_role", sa.String(length=32), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("performance_workbench_announcements", "visibility_role")
    op.drop_column("performance_workbench_announcements", "cycle_ref")
