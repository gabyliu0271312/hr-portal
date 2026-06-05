"""0014 dataset_relations: cardinality

表间关联基数：1:1 / 1:N / N:1。描述两表关系，供报表数值拆分规则做 UI 引导。
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0014_relation_cardinality"
down_revision: Union[str, None] = "0013_enum_options"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "dataset_relations",
        sa.Column(
            "cardinality",
            sa.String(8),
            nullable=False,
            server_default="1:1",
        ),
    )


def downgrade() -> None:
    op.drop_column("dataset_relations", "cardinality")
