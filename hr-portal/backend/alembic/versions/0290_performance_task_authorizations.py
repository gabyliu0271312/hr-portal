"""Task delegation preserves frozen handlers, answers and audit history."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = "0290_pm_task_authorizations"
down_revision = "0289_pm_task_drafts"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "performance_node_task_authorizations",
        sa.Column("id", sa.BigInteger(), sa.Identity(), primary_key=True),
        sa.Column("task_id", sa.BigInteger(), sa.ForeignKey("performance_node_tasks.id", ondelete="CASCADE"), nullable=False),
        sa.Column("project_id", sa.BigInteger(), sa.ForeignKey("performance_projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("cycle_ref", sa.String(64), nullable=False),
        sa.Column("authorization_type", sa.String(16), nullable=False),
        sa.Column("grantor_employee_no", sa.String(64), nullable=False),
        sa.Column("recipient_employee_no", sa.String(64), nullable=False),
        sa.Column("read_only", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("authorization_settings", sa.JSON().with_variant(JSONB(), "postgresql"), nullable=False, server_default="{}"),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("status", sa.String(16), nullable=False, server_default="ACTIVE"),
        sa.Column("revoked_by_employee_no", sa.String(64), nullable=True),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("authorization_type IN ('AUTHORIZE', 'TRANSFER')", name="ck_pm_task_authorization_type"),
        sa.CheckConstraint("status IN ('ACTIVE', 'REVOKED', 'REPLACED')", name="ck_pm_task_authorization_status"),
    )
    op.create_index("ix_pm_task_authorizations_cycle_status", "performance_node_task_authorizations", ["cycle_ref", "status", "created_at"])
    op.create_index("ix_pm_task_authorizations_recipient", "performance_node_task_authorizations", ["recipient_employee_no", "status"])


def downgrade():
    if op.get_bind().scalar(sa.text("SELECT 1 FROM performance_node_task_authorizations LIMIT 1")) is not None:
        raise RuntimeError("任务授权存在业务或审计记录，禁止删除；请先完成保留证据的回退方案")
    op.drop_table("performance_node_task_authorizations")
