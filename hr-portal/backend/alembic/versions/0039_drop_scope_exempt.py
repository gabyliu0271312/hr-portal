"""0039 删除 registered_tables.scope_exempt：免控白名单废弃，所有业务表无例外受控（005 G1）"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "0039_drop_scope_exempt"
down_revision: Union[str, None] = "0038_ai_conversations"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_column("registered_tables", "scope_exempt")


def downgrade() -> None:
    op.add_column(
        "registered_tables",
        sa.Column("scope_exempt", sa.Boolean(), nullable=False, server_default="false"),
    )
