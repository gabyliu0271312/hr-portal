"""0032 add source_field_id anchor to table_columns"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0032_source_field_id"
down_revision: Union[str, None] = "0031_result_field_labels"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "table_columns",
        sa.Column("source_field_id", sa.String(128), nullable=True),
    )
    op.create_index(
        "ix_table_col_source_field",
        "table_columns",
        ["table_name", "source_field_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_table_col_source_field", table_name="table_columns")
    op.drop_column("table_columns", "source_field_id")
