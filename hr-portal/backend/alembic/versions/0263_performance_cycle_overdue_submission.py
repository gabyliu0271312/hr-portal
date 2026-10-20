"""Persist cycle overdue submission defaults."""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0263_performance_cycle_overdue_submission"
down_revision: Union[str, None] = "0262_performance_authorization_prompts"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("performance_cycles", sa.Column("overdue_submission_enabled", sa.Boolean(), nullable=False, server_default=sa.true()))
    op.add_column("performance_cycles", sa.Column("overdue_submission_scope", sa.String(16), nullable=False, server_default="EVALUATION"))
    op.create_check_constraint(
        "ck_performance_cycle_overdue_submission_scope",
        "performance_cycles",
        "overdue_submission_scope IN ('EVALUATION', 'ALL')",
    )


def downgrade() -> None:
    op.drop_constraint("ck_performance_cycle_overdue_submission_scope", "performance_cycles", type_="check")
    op.drop_column("performance_cycles", "overdue_submission_scope")
    op.drop_column("performance_cycles", "overdue_submission_enabled")
