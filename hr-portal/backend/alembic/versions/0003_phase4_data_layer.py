"""0003 phase 4: datasources + 5 业务数据表 + 两棵树

- datasources / sync_runs：数据源配置 + 同步历史
- emp_realtime_roster / emp_monthly_roster / emp_monthly_salary
- emp_monthly_allocation / cost_center_monthly
- cost_center_tree / org_tree
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0003_phase4_data_layer"
down_revision: Union[str, None] = "0002_field_categories"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ===== datasources =====
    op.create_table(
        "datasources",
        sa.Column("id", sa.BigInteger, primary_key=True),
        sa.Column("table_name", sa.String(64), nullable=False),
        sa.Column("table_label", sa.String(64), nullable=False),
        sa.Column("source_type", sa.String(32), nullable=False),
        sa.Column("schedule", sa.String(64), nullable=False, server_default="手动触发"),
        sa.Column("settings", sa.JSON, nullable=False, server_default=sa.text("'{}'::json")),
        sa.Column("secrets_encrypted", sa.JSON, nullable=False, server_default=sa.text("'{}'::json")),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("last_sync_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_status", sa.String(16), nullable=False, server_default="pending"),
        sa.Column("last_rows", sa.Integer, nullable=True),
        sa.Column("last_message", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.UniqueConstraint("table_name", name="uq_datasources_table"),
    )

    op.create_table(
        "sync_runs",
        sa.Column("id", sa.BigInteger, primary_key=True),
        sa.Column(
            "datasource_id",
            sa.BigInteger,
            sa.ForeignKey("datasources.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("status", sa.String(16), nullable=False, server_default="running"),
        sa.Column("rows", sa.Integer, nullable=True),
        sa.Column("message", sa.Text, nullable=True),
        sa.Column("triggered_by", sa.String(32), nullable=False, server_default="manual"),
    )

    # ===== 5 张业务表 =====
    op.create_table(
        "emp_realtime_roster",
        sa.Column("id", sa.BigInteger, primary_key=True),
        sa.Column("employee_id", sa.String(32), nullable=False),
        sa.Column("name", sa.String(64), nullable=True),
        sa.Column("department", sa.String(255), nullable=True),
        sa.Column("position", sa.String(128), nullable=True),
        sa.Column("cost_center", sa.String(64), nullable=True),
        sa.Column("hire_date", sa.Date, nullable=True),
        sa.Column("status", sa.String(16), nullable=True),
        sa.Column("raw", sa.JSON, nullable=False, server_default=sa.text("'{}'::json")),
        sa.Column("synced_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.UniqueConstraint("employee_id", name="uq_emp_realtime_id"),
    )

    op.create_table(
        "emp_monthly_roster",
        sa.Column("id", sa.BigInteger, primary_key=True),
        sa.Column("period_ym", sa.String(7), nullable=False),
        sa.Column("employee_id", sa.String(32), nullable=False),
        sa.Column("name", sa.String(64), nullable=True),
        sa.Column("department", sa.String(255), nullable=True),
        sa.Column("cost_center", sa.String(64), nullable=True),
        sa.Column("in_service", sa.Boolean, nullable=False, server_default=sa.text("true")),
        sa.Column("raw", sa.JSON, nullable=False, server_default=sa.text("'{}'::json")),
        sa.Column("synced_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.UniqueConstraint("employee_id", "period_ym", name="uq_emp_monthly_roster"),
    )

    op.create_table(
        "emp_monthly_salary",
        sa.Column("id", sa.BigInteger, primary_key=True),
        sa.Column("period_ym", sa.String(7), nullable=False),
        sa.Column("employee_id", sa.String(32), nullable=False),
        sa.Column("name", sa.String(64), nullable=True),
        sa.Column("base_salary", sa.Numeric(14, 2), nullable=True),
        sa.Column("bonus", sa.Numeric(14, 2), nullable=True),
        sa.Column("social_security", sa.Numeric(14, 2), nullable=True),
        sa.Column("total_cost", sa.Numeric(14, 2), nullable=True),
        sa.Column("raw", sa.JSON, nullable=False, server_default=sa.text("'{}'::json")),
        sa.Column("synced_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.UniqueConstraint("employee_id", "period_ym", name="uq_emp_monthly_salary"),
    )

    op.create_table(
        "emp_monthly_allocation",
        sa.Column("id", sa.BigInteger, primary_key=True),
        sa.Column("period_ym", sa.String(7), nullable=False),
        sa.Column("employee_id", sa.String(32), nullable=False),
        sa.Column("name", sa.String(64), nullable=True),
        sa.Column("cc_code", sa.String(64), nullable=False),
        sa.Column("ratio", sa.Numeric(6, 4), nullable=True),
        sa.Column("amount", sa.Numeric(14, 2), nullable=True),
        sa.Column("raw", sa.JSON, nullable=False, server_default=sa.text("'{}'::json")),
        sa.Column("synced_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.UniqueConstraint("employee_id", "cc_code", "period_ym", name="uq_emp_monthly_allocation"),
    )

    op.create_table(
        "cost_center_monthly",
        sa.Column("id", sa.BigInteger, primary_key=True),
        sa.Column("period_ym", sa.String(7), nullable=False),
        sa.Column("cc_code", sa.String(64), nullable=False),
        sa.Column("cc_name", sa.String(255), nullable=True),
        sa.Column("manager", sa.String(64), nullable=True),
        sa.Column("budget", sa.Numeric(14, 2), nullable=True),
        sa.Column("actual", sa.Numeric(14, 2), nullable=True),
        sa.Column("raw", sa.JSON, nullable=False, server_default=sa.text("'{}'::json")),
        sa.Column("synced_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.UniqueConstraint("cc_code", "period_ym", name="uq_cc_monthly"),
    )

    # ===== 两棵树 =====
    op.create_table(
        "cost_center_tree",
        sa.Column("id", sa.BigInteger, primary_key=True),
        sa.Column("code", sa.String(64), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column(
            "parent_id",
            sa.BigInteger,
            sa.ForeignKey("cost_center_tree.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("level", sa.Integer, nullable=False, server_default="1"),
        sa.Column("is_leaf", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.text("true")),
        sa.Column("raw", sa.JSON, nullable=False, server_default=sa.text("'{}'::json")),
        sa.Column("synced_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.UniqueConstraint("code", name="uq_cc_tree_code"),
    )
    op.create_index("ix_cc_tree_parent", "cost_center_tree", ["parent_id"])

    op.create_table(
        "org_tree",
        sa.Column("id", sa.BigInteger, primary_key=True),
        sa.Column("code", sa.String(64), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column(
            "parent_id",
            sa.BigInteger,
            sa.ForeignKey("org_tree.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("level", sa.Integer, nullable=False, server_default="1"),
        sa.Column("is_leaf", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.text("true")),
        sa.Column("manager", sa.String(64), nullable=True),
        sa.Column("raw", sa.JSON, nullable=False, server_default=sa.text("'{}'::json")),
        sa.Column("synced_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.UniqueConstraint("code", name="uq_org_tree_code"),
    )
    op.create_index("ix_org_tree_parent", "org_tree", ["parent_id"])


def downgrade() -> None:
    op.drop_index("ix_org_tree_parent", table_name="org_tree")
    op.drop_table("org_tree")
    op.drop_index("ix_cc_tree_parent", table_name="cost_center_tree")
    op.drop_table("cost_center_tree")
    op.drop_table("cost_center_monthly")
    op.drop_table("emp_monthly_allocation")
    op.drop_table("emp_monthly_salary")
    op.drop_table("emp_monthly_roster")
    op.drop_table("emp_realtime_roster")
    op.drop_table("sync_runs")
    op.drop_table("datasources")
