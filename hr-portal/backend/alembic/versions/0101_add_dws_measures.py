"""add measures JSON field to dws_aggregate_definitions

Revision ID: 0101
Revises: 0100_add_dws_timefields
Create Date: 2026-07-17

支持多度量 DWS 宽表：一张 View 包含 N 个度量列，共享同一组维度。
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0101'
down_revision: Union[str, None] = "0100"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "dws_aggregate_definitions",
        sa.Column(
            "measures",
            sa.JSON(),
            nullable=True,
            server_default="[]",
            comment="多度量指标 ID 列表；为空时走单指标路径(metric_id)。每项: {metric_id}",
        ),
    )


def downgrade() -> None:
    op.drop_column("dws_aggregate_definitions", "measures")
