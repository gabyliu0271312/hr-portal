"""metric results: add result rows

Revision ID: 0094
Revises: 0093
Create Date: 2026-07-14
"""
from alembic import op
import sqlalchemy as sa


revision = "0094"
down_revision = "0093"


def _table_exists(inspector, table_name: str) -> bool:
    return table_name in inspector.get_table_names()


def _index_exists(inspector, table_name: str, index_name: str) -> bool:
    return any(i.get("name") == index_name for i in inspector.get_indexes(table_name))


def upgrade():
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    if not _table_exists(inspector, "metric_result_rows"):
        op.create_table(
            "metric_result_rows",
            sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
            sa.Column("result_id", sa.BigInteger(), nullable=False),
            sa.Column("metric_id", sa.BigInteger(), nullable=False),
            sa.Column("period", sa.String(length=32), nullable=False),
            sa.Column("row_index", sa.Integer(), nullable=False),
            sa.Column("dimension_values", sa.JSON(), nullable=False),
            sa.Column("measure_values", sa.JSON(), nullable=False),
            sa.Column("value", sa.JSON(), nullable=True),
            sa.Column("computed_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.ForeignKeyConstraint(["result_id"], ["metric_results.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["metric_id"], ["warehouse_metrics.id"], ondelete="CASCADE"),
            sa.UniqueConstraint("result_id", "row_index", name="uq_metric_result_rows_result_row_index"),
        )

    inspector = sa.inspect(conn)
    if not _index_exists(inspector, "metric_result_rows", "ix_metric_result_rows_result_id"):
        op.create_index("ix_metric_result_rows_result_id", "metric_result_rows", ["result_id"])
    inspector = sa.inspect(conn)
    if not _index_exists(inspector, "metric_result_rows", "ix_metric_result_rows_metric_period"):
        op.create_index("ix_metric_result_rows_metric_period", "metric_result_rows", ["metric_id", "period"])


def downgrade():
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    if _table_exists(inspector, "metric_result_rows"):
        op.drop_table("metric_result_rows")
