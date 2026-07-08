"""add label to datasets

Revision ID: 0072
Revises: 0071
Create Date: 2026-07-08
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0072"
down_revision: Union[str, None] = "0071"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "datasets",
        sa.Column(
            "label",
            sa.String(128),
            nullable=True,
            comment="数据集展示名称（中文，如'成本分摊DWD数据集'）",
        ),
    )


def downgrade() -> None:
    op.drop_column("datasets", "label")
