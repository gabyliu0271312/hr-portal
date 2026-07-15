"""add formula_sql to warehouse_metrics

Revision ID: 0095
Revises: 0094
Create Date: 2026-07-15

指标公式翻译：为 warehouse_metrics 表新增 formula_sql 字段，
存储由 Excel 公式翻译的 PostgreSQL SQL 表达式。
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "0095"
down_revision = "0094"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "warehouse_metrics",
        sa.Column(
            "formula_sql",
            sa.Text(),
            nullable=True,
            comment="由 Excel 公式翻译的 PostgreSQL SQL 表达式",
        ),
    )


def downgrade():
    op.drop_column("warehouse_metrics", "formula_sql")