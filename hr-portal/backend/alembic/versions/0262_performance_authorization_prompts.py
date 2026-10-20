"""Persist bilingual performance authorization prompts."""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0262_performance_authorization_prompts"
down_revision: Union[str, None] = "0261_performance_todo_notification_rule"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("performance_other_settings", sa.Column(
        "authorization_prompt_zh", sa.Text(), nullable=False,
        server_default="请确保授权对象有所选环节的操作资格，避免错误授权泄露敏感数据。",
    ))
    op.add_column("performance_other_settings", sa.Column(
        "authorization_prompt_en", sa.Text(), nullable=False,
        server_default="To prevent sensitive data exposure, please ensure that the authorized individuals has permission for the selected steps.",
    ))


def downgrade() -> None:
    op.drop_column("performance_other_settings", "authorization_prompt_en")
    op.drop_column("performance_other_settings", "authorization_prompt_zh")
