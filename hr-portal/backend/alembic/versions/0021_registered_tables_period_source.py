"""0021 registered_tables: 去掉 entity_keys，新增 period_source"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "0021_reg_period_source"
down_revision: Union[str, None] = "0020_registered_tables"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_column("registered_tables", "entity_keys")
    op.add_column(
        "registered_tables",
        sa.Column("period_source", sa.String(16), nullable=False, server_default="field"),
    )


def downgrade() -> None:
    op.drop_column("registered_tables", "period_source")
    op.add_column(
        "registered_tables",
        sa.Column("entity_keys", sa.JSON(), nullable=False, server_default="[]"),
    )
