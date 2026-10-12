"""Merge HRBP-scoped other permission settings and project member snapshot branches."""
from typing import Sequence, Union

from alembic import op


revision: str = "0236_merge_performance_scope_and_member_snapshot"
down_revision: Union[tuple[str, str], None] = (
    "0235_other_permission_hrbp_scope",
    "0235_project_member_profile_snapshot",
)
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
