"""add dws time fields (X05 phase 1)

Revision ID: 0100
Revises: 0099
Create Date: 2026-07-16

X05 一期（多粒度时间下钻）：dws_aggregate_definitions 增加
- time_field：时间/期次字段锚点（存 DatasetOutputField.output_code，如 snapshot_month），
  generate_dws_view 据此自动派生 year/quarter/month 三列。
- measure_semantics：度量语义（stock 存量/期末值 | flow 流量/可SUM），决定钻取时 SUM 还是取期末值。
time_grain 不动、不迁移（设计见 specs/012-data-warehouse-ucp-integration/x05-time-drilldown-two-phase-design.md）。
"""
from alembic import op
import sqlalchemy as sa


revision = "0100"
down_revision = "0099"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "dws_aggregate_definitions",
        sa.Column(
            "time_field",
            sa.String(128),
            nullable=True,
            comment="时间/期次字段 output_code（如 snapshot_month）；generate_dws_view 据此自动派生 year/quarter/month",
        ),
    )
    op.add_column(
        "dws_aggregate_definitions",
        sa.Column(
            "measure_semantics",
            sa.String(16),
            nullable=True,
            comment="度量语义: stock(存量/期末值) | flow(流量/可SUM)。NULL 按 flow 处理",
        ),
    )


def downgrade():
    op.drop_column("dws_aggregate_definitions", "measure_semantics")
    op.drop_column("dws_aggregate_definitions", "time_field")
