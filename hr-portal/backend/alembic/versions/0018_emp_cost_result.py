"""0018 新增业务表 emp_monthly_cost_result（员工月度成本分摊结果表）

数据来源：成本分摊工具计算后存档写入，不从源端拉取。
极简 schema：与其它业务表一致 (id, pk_hash, raw, synced_at)。
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0018_emp_cost_result"
down_revision: Union[str, None] = "0017_emp_cost_class"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "emp_monthly_cost_result",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("pk_hash", sa.String(64), nullable=False),
        sa.Column("raw", sa.JSON(), nullable=False),
        sa.Column(
            "synced_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.UniqueConstraint("pk_hash", name="uq_emp_cost_result_pk"),
    )
    op.create_index(
        "ix_emp_monthly_cost_result_pk_hash", "emp_monthly_cost_result", ["pk_hash"]
    )


def downgrade() -> None:
    op.drop_index("ix_emp_monthly_cost_result_pk_hash", table_name="emp_monthly_cost_result")
    op.drop_table("emp_monthly_cost_result")
