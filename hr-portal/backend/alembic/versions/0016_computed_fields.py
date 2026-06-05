"""0016 table_columns: is_computed + formula_expr

计算字段：用本表已有字段做四则运算生成的新列。
- is_computed：是否计算字段
- formula_expr：公式表达式，字段以 [列编码] 引用，如 "[应发工资] + [社保] - 5000"
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0016_computed_fields"
down_revision: Union[str, None] = "0015_agg_role"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "table_columns",
        sa.Column(
            "is_computed",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )
    op.add_column(
        "table_columns",
        sa.Column("formula_expr", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("table_columns", "formula_expr")
    op.drop_column("table_columns", "is_computed")