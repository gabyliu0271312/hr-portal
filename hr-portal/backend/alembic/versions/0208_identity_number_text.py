"""Store identity numbers as text in ODS and DWD roster tables."""
from alembic import op
import sqlalchemy as sa


revision = "0208_identity_number_text"
down_revision = "0207_merge_dwd_relation_dataset"
branch_labels = None
depends_on = None


_TABLES = ("emp_realtime_roster", "dwd_emp_realtime_roster")


def _quote_identifier(value: str) -> str:
    return '"' + value.replace('"', '""') + '"'


def _dependent_views(bind, table_name: str) -> list[tuple[int, str, str, str]]:
    rows = bind.execute(
        sa.text(
            """
            WITH RECURSIVE dependent_views AS (
                SELECT c.oid, n.nspname AS schema_name, c.relname AS view_name, 1 AS depth
                FROM pg_class base
                JOIN pg_namespace base_ns ON base_ns.oid = base.relnamespace
                JOIN pg_depend dep ON dep.refobjid = base.oid
                JOIN pg_rewrite rw ON rw.oid = dep.objid
                JOIN pg_class c ON c.oid = rw.ev_class
                JOIN pg_namespace n ON n.oid = c.relnamespace
                WHERE base_ns.nspname = 'public'
                  AND base.relname = :table_name
                  AND c.relkind = 'v'
                UNION
                SELECT c.oid, n.nspname, c.relname, dv.depth + 1
                FROM dependent_views dv
                JOIN pg_depend dep ON dep.refobjid = dv.oid
                JOIN pg_rewrite rw ON rw.oid = dep.objid
                JOIN pg_class c ON c.oid = rw.ev_class
                JOIN pg_namespace n ON n.oid = c.relnamespace
                WHERE c.relkind = 'v'
            )
            SELECT DISTINCT ON (oid)
                depth, schema_name, view_name, pg_get_viewdef(oid, true) AS definition
            FROM dependent_views
            ORDER BY oid, depth DESC
            """
        ),
        {"table_name": table_name},
    ).mappings().all()
    return [(int(row["depth"]), row["schema_name"], row["view_name"], row["definition"]) for row in rows]


def _alter_identity_column(bind, table_name: str) -> None:
    column_type = bind.execute(
        sa.text(
            """
            SELECT data_type
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = :table_name
              AND column_name = 'id_number'
            """
        ),
        {"table_name": table_name},
    ).scalar_one_or_none()
    if column_type is None or column_type == "text":
        return

    views = _dependent_views(bind, table_name)
    for _, schema_name, view_name, _ in sorted(views, reverse=True):
        bind.execute(
            sa.text(
                f"DROP VIEW {_quote_identifier(schema_name)}.{_quote_identifier(view_name)}"
            )
        )

    bind.execute(
        sa.text(
            f"ALTER TABLE {_quote_identifier('public')}.{_quote_identifier(table_name)} "
            "ALTER COLUMN id_number TYPE TEXT USING id_number::text"
        )
    )

    for _, schema_name, view_name, definition in sorted(views):
        bind.execute(
            sa.text(
                f"CREATE VIEW {_quote_identifier(schema_name)}.{_quote_identifier(view_name)} "
                f"AS {definition}"
            )
        )


def upgrade() -> None:
    bind = op.get_bind()

    for table_name in _TABLES:
        _alter_identity_column(bind, table_name)
        bind.execute(
            sa.text(
                """
                UPDATE table_columns
                SET data_type = 'string',
                    agg_role = 'dimension'
                WHERE table_name = :table_name
                  AND column_code = 'id_number'
                """
            ),
            {"table_name": table_name},
        )


def downgrade() -> None:
    # 证件号码可能包含 X 或前导零，不能安全恢复为 NUMERIC。
    pass
