"""0006 scheduler: 通用调度系统

scheduled_jobs：任务定义（kind + business_id + cron + payload）
job_runs：通用运行历史（按 kind 过滤即可看不同场景）

设计依据 → memory/hr_portal_scheduler_design.md
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0006_scheduler"
down_revision: Union[str, None] = "0005_reports"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "scheduled_jobs",
        sa.Column("id", sa.BigInteger, primary_key=True),
        sa.Column("kind", sa.String(32), nullable=False),
        sa.Column("business_id", sa.BigInteger, nullable=False),
        sa.Column("cron", sa.String(64), nullable=False),
        sa.Column("payload", sa.JSON, nullable=False, server_default=sa.text("'{}'::json")),
        sa.Column("enabled", sa.Boolean, nullable=False, server_default=sa.text("true")),
        sa.Column("last_run_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_status", sa.String(16), nullable=True),
        sa.Column("last_message", sa.Text, nullable=True),
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
        sa.UniqueConstraint("kind", "business_id", name="uq_scheduled_jobs_kind_biz"),
    )
    op.create_index("ix_scheduled_jobs_kind", "scheduled_jobs", ["kind"])

    op.create_table(
        "job_runs",
        sa.Column("id", sa.BigInteger, primary_key=True),
        sa.Column(
            "job_id",
            sa.BigInteger,
            sa.ForeignKey("scheduled_jobs.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("kind", sa.String(32), nullable=False),
        sa.Column("business_id", sa.BigInteger, nullable=True),
        sa.Column(
            "started_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("rows", sa.Integer, nullable=True),
        sa.Column("message", sa.Text, nullable=True),
        sa.Column("triggered_by", sa.String(64), nullable=False, server_default="manual"),
        sa.Column("payload_snapshot", sa.JSON, nullable=True),
    )
    op.create_index("ix_job_runs_kind_started", "job_runs", ["kind", "started_at"])
    op.create_index("ix_job_runs_job", "job_runs", ["job_id"])
    op.create_index("ix_job_runs_business", "job_runs", ["kind", "business_id"])


def downgrade() -> None:
    op.drop_index("ix_job_runs_business", table_name="job_runs")
    op.drop_index("ix_job_runs_job", table_name="job_runs")
    op.drop_index("ix_job_runs_kind_started", table_name="job_runs")
    op.drop_table("job_runs")
    op.drop_index("ix_scheduled_jobs_kind", table_name="scheduled_jobs")
    op.drop_table("scheduled_jobs")
