"""0013 table_columns: enum_options

「值列表」字段类型（data_type='enum'）的可选项，存为 JSON 字符串数组。
仅 enum 类型用到；其它类型为 NULL。
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0013_enum_options"
down_revision: Union[str, None] = "0012_copy_from_last_month"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "table_columns",
        sa.Column("enum_options", sa.JSON, nullable=True),
    )


def downgrade() -> None:
    op.drop_column("table_columns", "enum_options")
