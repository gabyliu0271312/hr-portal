"""add formula compile metadata to warehouse_metrics

Revision ID: 0099
Revises: 0098
Create Date: 2026-07-16

AST 编译器接入：为 warehouse_metrics 增加编译器元数据字段，
便于审计与可复现（文档 012 第 10.1 章）。
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "0099"
down_revision = "0098"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "warehouse_metrics",
        sa.Column(
            "formula_compile_engine",
            sa.String(32),
            nullable=True,
            comment="公式编译器：legacy / ast",
        ),
    )
    op.add_column(
        "warehouse_metrics",
        sa.Column(
            "formula_compile_version",
            sa.String(32),
            nullable=True,
            comment="公式编译器版本，如 1.0.0",
        ),
    )
    op.add_column(
        "warehouse_metrics",
        sa.Column(
            "formula_compile_meta",
            sa.JSON(),
            nullable=True,
            comment="编译元数据：dependencies/functions/warnings 等",
        ),
    )
    op.add_column(
        "warehouse_metrics",
        sa.Column(
            "formula_ast",
            sa.JSON(),
            nullable=True,
            comment="公式抽象语法树（调试/审计用）",
        ),
    )


def downgrade():
    op.drop_column("warehouse_metrics", "formula_ast")
    op.drop_column("warehouse_metrics", "formula_compile_meta")
    op.drop_column("warehouse_metrics", "formula_compile_version")
    op.drop_column("warehouse_metrics", "formula_compile_engine")
