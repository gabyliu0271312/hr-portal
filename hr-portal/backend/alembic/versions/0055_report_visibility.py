"""report visibility 三档 (private/scoped/public)

为 reports 增加 visibility 列并回填存量数据：
- is_published=True            -> public
- is_published=False 且有 ACL  -> scoped
- 其余                          -> private

Revision ID: 0055_report_visibility
Revises: 0054_data_compare_tasks
Create Date: 2026-06-30
"""
import sqlalchemy as sa
from alembic import op

revision = "0055_report_visibility"
down_revision = "0054_data_compare_tasks"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "reports",
        sa.Column(
            "visibility",
            sa.String(16),
            nullable=False,
            server_default="private",
        ),
    )
    # 回填存量数据
    op.execute("UPDATE reports SET visibility = 'public' WHERE is_published = true")
    op.execute(
        """
        UPDATE reports SET visibility = 'scoped'
        WHERE is_published = false
          AND id IN (SELECT DISTINCT report_id FROM report_acl)
        """
    )


def downgrade() -> None:
    op.drop_column("reports", "visibility")
