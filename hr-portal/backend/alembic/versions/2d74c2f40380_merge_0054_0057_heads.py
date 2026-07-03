"""merge_0054_0057_heads

Revision ID: 2d74c2f40380
Revises: 0054_data_compare_tasks, 0057_hr_pending_employee_full
Create Date: 2026-07-02 16:59:21.567724

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '2d74c2f40380'
down_revision: Union[str, None] = ('0054_data_compare_tasks', '0057_hr_pending_employee_full')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass