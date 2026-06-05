"""0012 table_columns: copy_from_last_month

手工字段「复制上月」开关：新月份同步时从上月同业务键行带值（只填空、不覆盖）。
仅对手工字段（auto_discovered=false）生效，接口字段不可用。
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0012_copy_from_last_month"
down_revision: Union[str, None] = "0011_installment_rules"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "table_columns",
        sa.Column(
            "copy_from_last_month",
            sa.Boolean,
            nullable=False,
            server_default=sa.text("false"),
        ),
    )


def downgrade() -> None:
    op.drop_column("table_columns", "copy_from_last_month")
