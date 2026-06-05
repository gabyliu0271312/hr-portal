"""0019 新增 allocation_schemes + allocation_runs（成本分摊方案与执行历史）"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "0019_allocation_schemes"
down_revision: Union[str, None] = "0018_emp_cost_result"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "allocation_schemes",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("name", sa.String(128), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("table_name", sa.String(64), nullable=False, server_default=""),
        sa.Column("dataset_id", sa.BigInteger(), sa.ForeignKey("datasets.id", ondelete="SET NULL"), nullable=True),
        sa.Column("result_table", sa.String(64), nullable=False, server_default="emp_monthly_cost_result"),
        sa.Column("config", sa.JSON(), nullable=False, server_default="{}"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("created_by", sa.BigInteger(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_table(
        "allocation_runs",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("scheme_id", sa.BigInteger(), sa.ForeignKey("allocation_schemes.id", ondelete="CASCADE"), nullable=False),
        sa.Column("period_ym", sa.String(6), nullable=False),
        sa.Column("status", sa.String(16), nullable=False, server_default="pending"),
        sa.Column("rows_written", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("triggered_by", sa.BigInteger(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_allocation_runs_scheme_id", "allocation_runs", ["scheme_id"])


def downgrade() -> None:
    op.drop_index("ix_allocation_runs_scheme_id", table_name="allocation_runs")
    op.drop_table("allocation_runs")
    op.drop_table("allocation_schemes")
