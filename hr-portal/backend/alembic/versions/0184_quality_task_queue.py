"""Add durable quality task queue."""

from alembic import op
import sqlalchemy as sa

revision = "0184_quality_task_queue"
down_revision = "0183_merge_quality_and_performance_heads"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "warehouse_quality_tasks",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("rule_id", sa.BigInteger(), sa.ForeignKey("warehouse_quality_rules.id", ondelete="CASCADE"), nullable=False),
        sa.Column("period", sa.String(length=16), nullable=True),
        sa.Column("source_sync_batch_id", sa.String(length=128), nullable=True),
        sa.Column("dedupe_key", sa.String(length=256), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False, server_default="pending"),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("available_at", sa.DateTime(), nullable=False),
        sa.Column("locked_at", sa.DateTime(), nullable=True),
        sa.Column("finished_at", sa.DateTime(), nullable=True),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("dedupe_key", name="uq_warehouse_quality_task_dedupe"),
    )
    op.create_index("ix_warehouse_quality_task_pick", "warehouse_quality_tasks", ["status", "available_at", "created_at"])


def downgrade() -> None:
    op.drop_index("ix_warehouse_quality_task_pick", table_name="warehouse_quality_tasks")
    op.drop_table("warehouse_quality_tasks")