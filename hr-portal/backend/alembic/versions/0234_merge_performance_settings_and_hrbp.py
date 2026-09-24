"""Merge performance settings and HRBP permission migration branches."""
from typing import Sequence, Union

from alembic import op


revision: str = "0234_merge_performance_settings_and_hrbp"
down_revision: Union[tuple[str, str], None] = (
    "0233_manager_reminder_settings",
    "0233_performance_hrbp_permissions",
)
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
