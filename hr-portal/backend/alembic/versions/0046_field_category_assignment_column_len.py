"""expand field category assignment column name length

Revision ID: 0046_field_category_assignment_column_len
Revises: 0045_org_unit_establish_date
Create Date: 2026-06-24
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0046_field_category_assignment_column_len"
down_revision: Union[str, None] = "0045_org_unit_establish_date"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column(
        "field_category_assignments",
        "column_name",
        existing_type=sa.String(length=64),
        type_=sa.String(length=128),
        existing_nullable=False,
    )


def downgrade() -> None:
    op.alter_column(
        "field_category_assignments",
        "column_name",
        existing_type=sa.String(length=128),
        type_=sa.String(length=64),
        existing_nullable=False,
    )
