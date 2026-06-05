"""0011 installment rules

- installment_rules: 补偿金分期支付规则（每行一期），默认 4 期各 25%、离职后 1/2/3/4 月 15 日付款
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0011_installment_rules"
down_revision: Union[str, None] = "0010_compensation_tools"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "installment_rules",
        sa.Column("id", sa.BigInteger, primary_key=True),
        sa.Column("period_no", sa.Integer, nullable=False),
        sa.Column("ratio", sa.Numeric(6, 3), nullable=False),
        sa.Column("months_after", sa.Integer, nullable=False),
        sa.Column("pay_day", sa.Integer, nullable=False, server_default="15"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.UniqueConstraint("period_no", name="uq_installment_period_no"),
    )
    # 默认 4 期：每期 25%，离职后第 1/2/3/4 个月的 15 日付款
    op.bulk_insert(
        sa.table(
            "installment_rules",
            sa.column("period_no", sa.Integer),
            sa.column("ratio", sa.Numeric(6, 3)),
            sa.column("months_after", sa.Integer),
            sa.column("pay_day", sa.Integer),
        ),
        [
            {"period_no": 1, "ratio": 25, "months_after": 1, "pay_day": 15},
            {"period_no": 2, "ratio": 25, "months_after": 2, "pay_day": 15},
            {"period_no": 3, "ratio": 25, "months_after": 3, "pay_day": 15},
            {"period_no": 4, "ratio": 25, "months_after": 4, "pay_day": 15},
        ],
    )


def downgrade() -> None:
    op.drop_table("installment_rules")
