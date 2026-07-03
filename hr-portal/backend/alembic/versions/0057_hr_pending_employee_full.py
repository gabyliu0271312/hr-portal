"""0057 hr_pending_employee_full 目标表

UCP Phase 1A Offer 同步写入的目标表。
合并北森待入职人员 + 飞书招聘 Offer 详情，按 application_id 幂等 upsert。
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0057_hr_pending_employee_full"
down_revision: Union[str, None] = "0056_ucp_phase1a"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "hr_pending_employee_full",
        # ===== 标准字段 =====
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),

        # ===== 北森待入职人员字段 =====
        sa.Column("application_id", sa.String(64), nullable=False, comment="投递ID，幂等主键"),
        sa.Column("employee_name", sa.String(128), nullable=True, comment="姓名"),
        sa.Column("mobile_phone", sa.String(32), nullable=True, comment="手机号（敏感字段）"),
        sa.Column("employee_id", sa.String(64), nullable=True, comment="员工ID/工号"),
        sa.Column("expected_entry_date", sa.String(32), nullable=True, comment="北森预计入职日期"),
        sa.Column("department_name", sa.String(128), nullable=True, comment="部门名称"),
        sa.Column("position_name", sa.String(128), nullable=True, comment="职位名称"),
        sa.Column("beisen_status", sa.String(32), nullable=True, comment="北森待入职状态"),

        # ===== 飞书招聘 Offer 字段 =====
        sa.Column("offer_id", sa.String(64), nullable=True, comment="飞书 Offer ID"),
        sa.Column("offer_status", sa.String(32), nullable=True, comment="Offer 状态：pending/accepted/rejected"),
        sa.Column("offer_salary", sa.String(64), nullable=True, comment="薪酬（敏感字段）"),
        sa.Column("offer_salary_unit", sa.String(16), nullable=True, comment="薪酬单位：monthly/yearly"),
        sa.Column("offer_entry_date", sa.String(32), nullable=True, comment="Offer 确定入职日期"),
        sa.Column("offer_reject_reason", sa.String(255), nullable=True, comment="Offer 拒绝原因"),
        sa.Column("offer_created_at", sa.String(32), nullable=True, comment="Offer 创建时间"),

        # ===== UCP 同步元数据 =====
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true"), comment="是否活跃"),
        sa.Column("sync_status", sa.String(32), nullable=False, server_default="ACTIVE",
                   comment="同步状态：ACTIVE/NOT_IN_SOURCE/OFFER_NOT_FOUND"),
        sa.Column("last_synced_at", sa.DateTime(timezone=True), nullable=True, comment="最近同步时间"),
        sa.Column("last_pipeline_run_id", sa.String(64), nullable=True, comment="最近关联 Pipeline Run ID"),
        sa.Column("beisen_synced_at", sa.DateTime(timezone=True), nullable=True, comment="北森数据同步时间"),
        sa.Column("offer_synced_at", sa.DateTime(timezone=True), nullable=True, comment="Offer 数据同步时间"),

        # ===== 索引与约束 =====
        sa.UniqueConstraint("application_id", name="uq_pending_employee_application_id"),
    )

    # 补充索引：活跃记录查询
    op.create_index(
        "ix_pending_employee_active",
        "hr_pending_employee_full",
        ["is_active", "sync_status"],
    )

    # 补充索引：按部门查询
    op.create_index(
        "ix_pending_employee_department",
        "hr_pending_employee_full",
        ["department_name"],
    )

    # 补充索引：按同步时间范围查询
    op.create_index(
        "ix_pending_employee_last_synced",
        "hr_pending_employee_full",
        ["last_synced_at"],
    )

    # 将表注册到 registered_tables，使动态加载器可以发现
    op.execute(
        sa.text(
            "INSERT INTO registered_tables "
            "(table_name, table_label, description, is_period, period_col, period_source, is_builtin) "
            "VALUES (:table_name, :table_label, :description, :is_period, :period_col, :period_source, :is_builtin)"
        ).bindparams(
            table_name="hr_pending_employee_full",
            table_label="待入职人员全量信息（北森+飞书Offer）",
            description="UCP Phase 1A Offer 同步目标表，合并北森待入职人员基础信息与飞书招聘 Offer 详情",
            is_period=False,
            period_col="month",
            period_source="field",
            is_builtin=True,
        )
    )

    # 注册字段元数据到 table_columns（核心字段，非自动发现）
    columns_seed = [
        ("application_id", "投递ID", "string", True, True, False, 1),
        ("employee_name", "姓名", "string", False, False, True, 2),
        ("mobile_phone", "手机号", "string", False, True, True, 3),
        ("employee_id", "员工ID", "string", False, False, True, 4),
        ("expected_entry_date", "预计入职日期", "string", False, False, True, 5),
        ("department_name", "部门名称", "string", False, False, True, 6),
        ("position_name", "职位名称", "string", False, False, True, 7),
        ("beisen_status", "北森状态", "string", False, False, True, 8),
        ("offer_id", "Offer ID", "string", False, False, True, 9),
        ("offer_status", "Offer 状态", "string", False, False, True, 10),
        ("offer_salary", "薪酬", "string", False, True, True, 11),
        ("offer_salary_unit", "薪酬单位", "string", False, False, True, 12),
        ("offer_entry_date", "Offer 入职日期", "string", False, False, True, 13),
        ("offer_reject_reason", "拒绝原因", "string", False, False, True, 14),
        ("offer_created_at", "Offer 创建时间", "string", False, False, True, 15),
        ("is_active", "是否活跃", "bool", False, False, False, 16),
        ("sync_status", "同步状态", "string", False, False, False, 17),
        ("last_synced_at", "最近同步时间", "datetime", False, False, False, 18),
    ]

    for col_code, col_label, data_type, is_pk, is_sensitive, is_visible, display_order in columns_seed:
        op.execute(
            sa.text(
                "INSERT INTO table_columns "
                "(table_name, column_code, column_label, data_type, is_pk_part, is_sensitive, "
                "is_visible, display_order, auto_discovered, agg_role) "
                "VALUES (:tn, :cc, :cl, :dt, :pk, :sens, :vis, :ord, :auto, :agg)"
            ).bindparams(
                tn="hr_pending_employee_full",
                cc=col_code,
                cl=col_label,
                dt=data_type,
                pk=is_pk,
                sens=is_sensitive,
                vis=is_visible,
                ord=display_order,
                auto=True,
                agg="dimension",
            )
        )


def downgrade() -> None:
    # 删除 table_columns 注册
    op.execute(
        sa.text("DELETE FROM table_columns WHERE table_name = :tn").bindparams(tn="hr_pending_employee_full")
    )

    # 删除 registered_tables 注册
    op.execute(
        sa.text("DELETE FROM registered_tables WHERE table_name = :tn").bindparams(tn="hr_pending_employee_full")
    )

    # 删除索引
    op.drop_index("ix_pending_employee_last_synced", table_name="hr_pending_employee_full")
    op.drop_index("ix_pending_employee_department", table_name="hr_pending_employee_full")
    op.drop_index("ix_pending_employee_active", table_name="hr_pending_employee_full")

    # 删除表
    op.drop_table("hr_pending_employee_full")
