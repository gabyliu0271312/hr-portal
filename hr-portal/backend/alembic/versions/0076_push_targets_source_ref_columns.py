"""add source_type/source_id/source_label to push_targets + backfill

Revision ID: 0076
Revises: 0075
Create Date: 2026-07-09
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0076_push_targets_source_ref_columns"
down_revision: Union[str, None] = "0075_service_run_logs"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. 加列
    op.add_column("push_targets", sa.Column("source_type", sa.String(16), nullable=False, server_default="table", comment="来源类型: table/dataset/metric/ads/report"))
    op.add_column("push_targets", sa.Column("source_id", sa.String(64), nullable=False, server_default="", comment="来源 ID"))
    op.add_column("push_targets", sa.Column("source_label", sa.String(128), nullable=False, server_default="", comment="来源展示名"))

    # 2. 回填：从 settings.source_ref 读取
    #    Python 端执行，不用裸 SQL 处理 JSON
    op.execute("""
        UPDATE push_targets
        SET source_type = COALESCE(NULLIF(settings->'source_ref'->>'source_type', ''), 'table'),
            source_id   = COALESCE(NULLIF(settings->'source_ref'->>'source_id', ''), source_table),
            source_label = COALESCE(settings->'source_ref'->>'source_label', '')
        WHERE settings ? 'source_ref'
    """)
    # 3. 回填：无 source_ref 的旧数据
    op.execute("""
        UPDATE push_targets
        SET source_type = CASE
                WHEN source_table LIKE 'report:%' THEN 'report'
                ELSE 'table'
            END,
            source_id = CASE
                WHEN source_table LIKE 'report:%' THEN SUBSTRING(source_table FROM 8)
                ELSE source_table
            END,
            source_label = source_table
        WHERE source_type = 'table' AND source_id = ''
    """)


def downgrade() -> None:
    op.drop_column("push_targets", "source_label")
    op.drop_column("push_targets", "source_id")
    op.drop_column("push_targets", "source_type")
