"""0040 registered_tables.roster_join_col：G3 子查询穿透声明（本表关联花名册 employee_no 的列）"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "0040_roster_join_col"
down_revision: Union[str, None] = "0039_drop_scope_exempt"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "registered_tables",
        sa.Column("roster_join_col", sa.String(length=64), nullable=True),
    )
    # 为已有内置表补穿透声明：工资表 / 分摊表经 employee_no 关联花名册
    op.execute(
        "UPDATE registered_tables SET roster_join_col='employee_no' "
        "WHERE table_name IN ('emp_monthly_salary','emp_monthly_allocation')"
    )


def downgrade() -> None:
    op.drop_column("registered_tables", "roster_join_col")
