"""0015 table_columns: agg_role

字段在报表聚合里的角色：'dimension'（维度，用于 GROUP BY）/ 'measure'（度量，可聚合）。
自动预标：数字类型 → measure，其余 → dimension；管理员可在字段管理手动调整。
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0015_agg_role"
down_revision: Union[str, None] = "0014_relation_cardinality"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "table_columns",
        sa.Column(
            "agg_role",
            sa.String(16),
            nullable=False,
            server_default="dimension",
        ),
    )
    # 现有字段回填：数字类型 → measure，其余保持 dimension
    op.execute(
        "UPDATE table_columns SET agg_role = 'measure' WHERE data_type = 'number'"
    )


def downgrade() -> None:
    op.drop_column("table_columns", "agg_role")
