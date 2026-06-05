"""0005 reports: 报表中台 — 列表型报表

新增 reports 表。
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0005_reports"
down_revision: Union[str, None] = "0004_c1_dynamic_columns"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "reports",
        sa.Column("id", sa.BigInteger, primary_key=True),
        sa.Column("name", sa.String(128), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("table_name", sa.String(64), nullable=False),
        sa.Column("config", sa.JSON, nullable=False, server_default=sa.text("'{}'::json")),
        sa.Column(
            "owner_id",
            sa.BigInteger,
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("is_published", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("last_run_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("run_count", sa.BigInteger, nullable=False, server_default="0"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )
    op.create_index("ix_reports_table", "reports", ["table_name"])
    op.create_index("ix_reports_owner", "reports", ["owner_id"])


def downgrade() -> None:
    op.drop_index("ix_reports_owner", table_name="reports")
    op.drop_index("ix_reports_table", table_name="reports")
    op.drop_table("reports")
