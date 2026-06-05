"""0017 新增业务表 emp_monthly_cost_class（员工月度成本归集分类表）

极简 schema：与其它 5 张业务表一致 (id, pk_hash, raw, synced_at)。
暂不接接口，列由管理员在「字段管理」手动添加，行通过数据视图「新增行」手工录入。
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0017_emp_cost_class"
down_revision: Union[str, None] = "0016_computed_fields"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "emp_monthly_cost_class",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("pk_hash", sa.String(64), nullable=False),
        sa.Column("raw", sa.JSON(), nullable=False),
        sa.Column(
            "synced_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.UniqueConstraint("pk_hash", name="uq_emp_cost_class_pk"),
    )
    op.create_index(
        "ix_emp_monthly_cost_class_pk_hash", "emp_monthly_cost_class", ["pk_hash"]
    )


def downgrade() -> None:
    op.drop_index("ix_emp_monthly_cost_class_pk_hash", table_name="emp_monthly_cost_class")
    op.drop_table("emp_monthly_cost_class")
