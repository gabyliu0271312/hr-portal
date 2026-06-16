"""Drop retired JSON columns from source and tree tables."""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0033_drop_tree_raw_columns"
down_revision: Union[str, None] = "0032_source_field_id"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


TABLES = (
    "emp_realtime_roster",
    "emp_monthly_roster",
    "emp_monthly_salary",
    "emp_monthly_allocation",
    "cost_center_monthly",
    "emp_monthly_cost_class",
    "emp_monthly_cost_result",
    "emp_severance_installment",
    "emp_year_end_bonus",
    "cost_center_tree",
    "org_tree",
)


DEPENDENT_RAW_VIEWS_SQL = sa.text(
    """
    WITH target AS (
        SELECT to_regclass(:qualified_table) AS oid
    )
    SELECT DISTINCT
        CASE dependent.relkind
            WHEN 'm' THEN 'MATERIALIZED VIEW'
            ELSE 'VIEW'
        END AS drop_kind,
        format('%I.%I', dependent_ns.nspname, dependent.relname) AS view_name
    FROM target
    JOIN pg_attribute attr
      ON attr.attrelid = target.oid
     AND attr.attname = 'raw'
     AND NOT attr.attisdropped
    JOIN pg_depend dep
      ON dep.refobjid = target.oid
     AND dep.refobjsubid = attr.attnum
    JOIN pg_rewrite rewrite
      ON rewrite.oid = dep.objid
    JOIN pg_class dependent
      ON dependent.oid = rewrite.ev_class
    JOIN pg_namespace dependent_ns
      ON dependent_ns.oid = dependent.relnamespace
    WHERE target.oid IS NOT NULL
      AND dependent.relkind IN ('v', 'm')
    ORDER BY view_name
    """
)


def _drop_raw_dependent_views(bind, table_name: str) -> None:
    views = bind.execute(
        DEPENDENT_RAW_VIEWS_SQL,
        {"qualified_table": f"public.{table_name}"},
    ).mappings().all()
    for view in views:
        op.execute(f"DROP {view['drop_kind']} IF EXISTS {view['view_name']} CASCADE")


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    for table_name in TABLES:
        if not inspector.has_table(table_name):
            continue
        columns = {col["name"] for col in inspector.get_columns(table_name)}
        if "raw" in columns:
            _drop_raw_dependent_views(bind, table_name)
            op.drop_column(table_name, "raw")


def downgrade() -> None:
    # The retired JSON-column structure is not restored.
    pass
