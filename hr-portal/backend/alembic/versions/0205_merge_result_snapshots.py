"""Add table merge preview and monthly result snapshots."""
from alembic import op
import sqlalchemy as sa

revision = "0205_merge_result_snapshots"
down_revision = "0205_performance_template_workflows"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "merge_preview_runs",
        sa.Column("id", sa.BigInteger(), nullable=False),
        sa.Column("token", sa.String(64), nullable=False),
        sa.Column("template_id", sa.BigInteger(), nullable=False),
        sa.Column("template_version", sa.Integer(), nullable=False),
        sa.Column("merge_keys_snapshot", sa.JSON(), nullable=False),
        sa.Column("columns_snapshot", sa.JSON(), nullable=False),
        sa.Column("rows", sa.JSON(), nullable=False),
        sa.Column("stats", sa.JSON(), nullable=True),
        sa.Column("recognize_log", sa.JSON(), nullable=True),
        sa.Column("anomalies", sa.JSON(), nullable=True),
        sa.Column("dwd_anomalies", sa.JSON(), nullable=True),
        sa.Column("created_by", sa.BigInteger(), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["template_id"], ["merge_templates.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("token", name="uq_merge_preview_run_token"),
    )
    op.create_index("ix_merge_preview_run_owner", "merge_preview_runs", ["created_by", "created_at"])
    op.create_table(
        "merge_result_batches",
        sa.Column("id", sa.BigInteger(), nullable=False),
        sa.Column("template_id", sa.BigInteger(), nullable=False),
        sa.Column("period", sa.String(6), nullable=False),
        sa.Column("template_version", sa.Integer(), nullable=False),
        sa.Column("merge_keys_snapshot", sa.JSON(), nullable=False),
        sa.Column("columns_snapshot", sa.JSON(), nullable=False),
        sa.Column("stats", sa.JSON(), nullable=True),
        sa.Column("anomalies", sa.JSON(), nullable=True),
        sa.Column("dwd_anomalies", sa.JSON(), nullable=True),
        sa.Column("row_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_by", sa.BigInteger(), nullable=True),
        sa.Column("updated_by", sa.BigInteger(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["template_id"], ["merge_templates.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("template_id", "period", name="uq_merge_result_batch_template_period"),
    )
    op.create_index("ix_merge_result_batch_template", "merge_result_batches", ["template_id"])
    op.create_table(
        "merge_result_rows",
        sa.Column("id", sa.BigInteger(), nullable=False),
        sa.Column("batch_id", sa.BigInteger(), nullable=False),
        sa.Column("merge_key", sa.JSON(), nullable=False),
        sa.Column("merge_key_hash", sa.String(64), nullable=False),
        sa.Column("values", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["batch_id"], ["merge_result_batches.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("batch_id", "merge_key_hash", name="uq_merge_result_row_key"),
    )
    op.create_index("ix_merge_result_row_batch", "merge_result_rows", ["batch_id"])


def downgrade() -> None:
    op.drop_index("ix_merge_result_row_batch", table_name="merge_result_rows")
    op.drop_table("merge_result_rows")
    op.drop_index("ix_merge_result_batch_template", table_name="merge_result_batches")
    op.drop_table("merge_result_batches")
    op.drop_index("ix_merge_preview_run_owner", table_name="merge_preview_runs")
    op.drop_table("merge_preview_runs")
