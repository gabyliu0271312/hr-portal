"""0028 registered_tables.scope_exempt: 数据范围免控声明（fail-closed 配套）"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "0028_scope_exempt"
down_revision: Union[str, None] = "0027_formula_catalog"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "registered_tables",
        sa.Column("scope_exempt", sa.Boolean(), nullable=False, server_default="false"),
    )


def downgrade() -> None:
    op.drop_column("registered_tables", "scope_exempt")
