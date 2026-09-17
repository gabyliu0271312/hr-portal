"""Add PM-T008 project snapshots and node tasks."""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0223_performance_project_tasks"
down_revision = "0222_performance_template_status"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "performance_project_member_snapshots",
        sa.Column("id", sa.BigInteger(), sa.Identity(), primary_key=True),
        sa.Column("project_id", sa.BigInteger(), sa.ForeignKey("performance_projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("cycle_ref", sa.String(64), nullable=False),
        sa.Column("snapshot_version", sa.Integer(), nullable=False),
        sa.Column("source_snapshot_id", sa.BigInteger(), sa.ForeignKey("performance_authorization_snapshots.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("source_filter", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("project_id", "snapshot_version", name="uq_performance_project_member_snapshot_version"),
    )
    op.create_index("ix_performance_project_member_snapshot_project", "performance_project_member_snapshots", ["project_id", "created_at"])
    op.create_table(
        "performance_project_members",
        sa.Column("id", sa.BigInteger(), sa.Identity(), primary_key=True),
        sa.Column("snapshot_id", sa.BigInteger(), sa.ForeignKey("performance_project_member_snapshots.id", ondelete="CASCADE"), nullable=False),
        sa.Column("employee_no", sa.String(64), nullable=False),
        sa.Column("portal_user_id", sa.BigInteger(), nullable=True),
        sa.Column("display_name", sa.String(128), nullable=False),
        sa.Column("organization_ref", sa.String(128), nullable=True),
        sa.Column("direct_manager_employee_no", sa.String(64), nullable=True),
        sa.Column("hrbp_employee_no", sa.String(64), nullable=True),
        sa.Column("employment_status", sa.String(64), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("snapshot_id", "employee_no", name="uq_performance_project_member_employee"),
    )
    op.create_index("ix_performance_project_members_portal_user", "performance_project_members", ["snapshot_id", "portal_user_id"])
    op.create_table(
        "performance_project_node_snapshots",
        sa.Column("id", sa.BigInteger(), sa.Identity(), primary_key=True),
        sa.Column("project_id", sa.BigInteger(), sa.ForeignKey("performance_projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("node_id", sa.String(128), nullable=False),
        sa.Column("node_type", sa.String(64), nullable=False),
        sa.Column("name", sa.String(128), nullable=False),
        sa.Column("node_order", sa.Integer(), nullable=False),
        sa.Column("config", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("project_id", "node_id", name="uq_performance_project_node_snapshot"),
    )
    op.create_index("ix_performance_project_node_snapshot_project_order", "performance_project_node_snapshots", ["project_id", "node_order"])
    op.create_table(
        "performance_node_tasks",
        sa.Column("id", sa.BigInteger(), sa.Identity(), primary_key=True),
        sa.Column("project_id", sa.BigInteger(), sa.ForeignKey("performance_projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("cycle_ref", sa.String(64), nullable=False),
        sa.Column("member_snapshot_id", sa.BigInteger(), sa.ForeignKey("performance_project_member_snapshots.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("node_snapshot_id", sa.BigInteger(), sa.ForeignKey("performance_project_node_snapshots.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("target_employee_no", sa.String(64), nullable=False),
        sa.Column("handler_ref", sa.String(128), nullable=False),
        sa.Column("task_kind", sa.String(64), nullable=False),
        sa.Column("status", sa.String(32), nullable=False, server_default="pending"),
        sa.Column("available_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("due_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("project_id", "member_snapshot_id", "node_snapshot_id", "target_employee_no", "handler_ref", "task_kind", name="uq_performance_node_task_generation"),
    )
    op.create_index("ix_performance_node_tasks_handler_state", "performance_node_tasks", ["handler_ref", "status"])
    op.create_index("ix_performance_node_tasks_project_node", "performance_node_tasks", ["project_id", "node_snapshot_id"])


def downgrade() -> None:
    op.drop_index("ix_performance_node_tasks_project_node", table_name="performance_node_tasks")
    op.drop_index("ix_performance_node_tasks_handler_state", table_name="performance_node_tasks")
    op.drop_table("performance_node_tasks")
    op.drop_index("ix_performance_project_node_snapshot_project_order", table_name="performance_project_node_snapshots")
    op.drop_table("performance_project_node_snapshots")
    op.drop_index("ix_performance_project_members_portal_user", table_name="performance_project_members")
    op.drop_table("performance_project_members")
    op.drop_index("ix_performance_project_member_snapshot_project", table_name="performance_project_member_snapshots")
    op.drop_table("performance_project_member_snapshots")
