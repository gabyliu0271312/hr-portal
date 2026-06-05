"""0004 C1 dynamic columns: 重建 5 张业务表 + 新增 table_columns 元数据

DROP & CREATE 5 张业务表（旧 schema 写死的列已废弃）。
新增 table_columns：自动发现的字段元数据，管理员可改名/标记敏感/调主键。
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0004_c1_dynamic_columns"
down_revision: Union[str, None] = "0003_phase4_data_layer"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 删除旧的 5 张业务表（数据丢失，因为字段语义变了；树表保留）
    op.drop_table("emp_monthly_allocation")
    op.drop_table("emp_monthly_salary")
    op.drop_table("emp_monthly_roster")
    op.drop_table("emp_realtime_roster")
    op.drop_table("cost_center_monthly")

    # 重建：极简 schema
    for table in (
        "emp_realtime_roster",
        "emp_monthly_roster",
        "emp_monthly_salary",
        "emp_monthly_allocation",
        "cost_center_monthly",
    ):
        op.create_table(
            table,
            sa.Column("id", sa.BigInteger, primary_key=True),
            sa.Column("pk_hash", sa.String(64), nullable=False),
            sa.Column("raw", sa.JSON, nullable=False, server_default=sa.text("'{}'::json")),
            sa.Column(
                "synced_at",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.text("now()"),
            ),
            sa.UniqueConstraint("pk_hash", name=f"uq_{table}_pk"),
        )
        op.create_index(f"ix_{table}_pk_hash", table, ["pk_hash"])

    # table_columns 元数据表
    op.create_table(
        "table_columns",
        sa.Column("id", sa.BigInteger, primary_key=True),
        sa.Column("table_name", sa.String(64), nullable=False),
        sa.Column("column_code", sa.String(128), nullable=False),
        sa.Column("column_label", sa.String(128), nullable=False),
        sa.Column("data_type", sa.String(16), nullable=False, server_default="string"),
        sa.Column("is_pk_part", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("is_sensitive", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("is_visible", sa.Boolean, nullable=False, server_default=sa.text("true")),
        sa.Column("display_order", sa.Integer, nullable=False, server_default="999"),
        sa.Column("auto_discovered", sa.Boolean, nullable=False, server_default=sa.text("true")),
        sa.Column("description", sa.Text, nullable=True),
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
        sa.UniqueConstraint("table_name", "column_code", name="uq_table_col"),
    )
    op.create_index(
        "ix_table_col_table_order", "table_columns", ["table_name", "display_order"]
    )


def downgrade() -> None:
    op.drop_index("ix_table_col_table_order", table_name="table_columns")
    op.drop_table("table_columns")

    for table in (
        "cost_center_monthly",
        "emp_monthly_allocation",
        "emp_monthly_salary",
        "emp_monthly_roster",
        "emp_realtime_roster",
    ):
        op.drop_index(f"ix_{table}_pk_hash", table_name=table)
        op.drop_table(table)

    # 注意：downgrade 不重建旧 schema，开发期不必回滚
