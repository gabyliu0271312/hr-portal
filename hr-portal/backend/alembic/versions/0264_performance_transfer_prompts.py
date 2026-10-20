"""Persist bilingual performance transfer prompts."""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0264_performance_transfer_prompts"
down_revision: Union[str, None] = "0263_performance_cycle_overdue_submission"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("performance_other_settings", sa.Column(
        "transfer_prompt_zh", sa.Text(), nullable=False,
        server_default="请确保转交对象有所选环节的操作资格，避免错误授权泄露敏感数据。",
    ))
    op.add_column("performance_other_settings", sa.Column(
        "transfer_prompt_en", sa.Text(), nullable=False,
        server_default="To prevent sensitive data exposure, please ensure that the transferee has permission for the selected steps.",
    ))


def downgrade() -> None:
    op.drop_column("performance_other_settings", "transfer_prompt_en")
    op.drop_column("performance_other_settings", "transfer_prompt_zh")
