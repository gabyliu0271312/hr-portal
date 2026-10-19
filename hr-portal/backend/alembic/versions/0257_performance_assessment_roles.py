"""Persist the assessment role catalog metadata."""
from alembic import op
import sqlalchemy as sa

revision = "0257_performance_assessment_roles"
down_revision = "0256_performance_cycle_template"
branch_labels = None
depends_on = None


ASSESSMENT_ROLES = (
    ("assessment.reviewee", "被评估人", "员工本人"),
    ("assessment.line_manager", "实线上级", "从组织架构中获取"),
    ("assessment.dotted_manager", "虚线上级", "从组织架构中获取"),
    ("assessment.project_manager", "直属项目上级", "在周期中导入"),
    ("assessment.reviewer_360", "360°评估人", "通过 360 邀请添加"),
    ("assessment.calibrator", "校准人", "在项目配置中指定"),
    ("assessment.metric_evaluator", "指标评价人", "在添加指标时指定"),
)


def upgrade():
    op.add_column(
        "performance_roles",
        sa.Column("role_type", sa.String(length=16), server_default="MANAGEMENT", nullable=False),
    )
    op.add_column(
        "performance_roles",
        sa.Column("member_source", sa.String(length=64), nullable=True),
    )
    op.create_check_constraint(
        "ck_performance_roles_role_type",
        "performance_roles",
        "role_type IN ('MANAGEMENT', 'ASSESSMENT')",
    )
    op.create_index(
        "ix_performance_roles_role_type_active",
        "performance_roles",
        ["role_type", "is_active"],
    )

    for code, name, member_source in ASSESSMENT_ROLES:
        conflict = op.get_bind().execute(
            sa.text("SELECT role_type, is_system FROM performance_roles WHERE code = :code"),
            {"code": code},
        ).first()
        if conflict is not None and (conflict.role_type != "ASSESSMENT" or not conflict.is_system):
            raise ValueError(f"评估角色编码已被非系统角色占用：{code}")
        op.execute(
            sa.text(
                """
                INSERT INTO performance_roles
                    (code, name, description, role_type, member_source, is_system, is_active)
                VALUES
                    (:code, :name, '系统预置角色', 'ASSESSMENT', :member_source, true, true)
                ON CONFLICT (code) DO NOTHING
                """
            ).bindparams(code=code, name=name, member_source=member_source)
        )


def downgrade():
    for code, _, _ in ASSESSMENT_ROLES:
        op.execute(sa.text("DELETE FROM performance_roles WHERE role_type = 'ASSESSMENT' AND code = :code").bindparams(code=code))
    op.drop_index("ix_performance_roles_role_type_active", table_name="performance_roles")
    op.drop_constraint("ck_performance_roles_role_type", "performance_roles", type_="check")
    op.drop_column("performance_roles", "member_source")
    op.drop_column("performance_roles", "role_type")
