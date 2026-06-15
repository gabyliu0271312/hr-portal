from types import SimpleNamespace

import pytest

from scripts.rebuild_source_tables import (
    DEFAULT_REBUILD_TABLES,
    RebuildTablePlan,
    normalize_table_names,
    parse_args,
    render_plan,
)
from app.data.ddl import SourceColumn


def test_normalize_table_names_defaults_to_nine_rebuild_tables():
    assert normalize_table_names() == DEFAULT_REBUILD_TABLES
    assert len(normalize_table_names()) == 9


def test_normalize_table_names_dedupes_and_validates():
    assert normalize_table_names(["emp_realtime_roster", "emp_realtime_roster"]) == [
        "emp_realtime_roster"
    ]
    with pytest.raises(Exception):
        normalize_table_names(["bad-name"])


def test_render_plan_shows_drop_create_and_no_raw_column():
    plan = RebuildTablePlan(
        table_name="emp_monthly_salary",
        table_label="员工月度工资表",
        columns=[
            SourceColumn("employee_no", "string"),
            SourceColumn("base_salary", "number"),
        ],
        drop_sql='DROP TABLE IF EXISTS "emp_monthly_salary" CASCADE',
        create_sql=[
            'CREATE TABLE IF NOT EXISTS "emp_monthly_salary" ('
            '\n    id BIGSERIAL PRIMARY KEY,'
            '\n    pk_hash VARCHAR(64) NOT NULL,'
            '\n    synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),'
            '\n    "employee_no" TEXT,'
            '\n    "base_salary" NUMERIC,'
            '\n    CONSTRAINT "uq_emp_monthly_salary_pk" UNIQUE (pk_hash)'
            "\n)",
            'CREATE INDEX IF NOT EXISTS "ix_emp_monthly_salary_pk_hash" '
            'ON "emp_monthly_salary" (pk_hash)',
        ],
    )

    rendered = render_plan([plan])

    assert "WARNING" in rendered
    assert 'DROP TABLE IF EXISTS "emp_monthly_salary" CASCADE;' in rendered
    assert '"base_salary" NUMERIC' in rendered
    assert "raw" not in rendered


def test_parse_args_requires_explicit_apply_acknowledgement_shape():
    args = parse_args(["--apply", "--i-understand-this-drops-data"])

    assert args.apply is True
    assert args.i_understand_this_drops_data is True


def test_plan_dataclass_accepts_registered_table_like_metadata():
    # Tiny smoke test for the plan shape used by build_rebuild_plans without a DB.
    rt = SimpleNamespace(table_name="emp_realtime_roster", table_label="员工实时花名册")
    plan = RebuildTablePlan(
        table_name=rt.table_name,
        table_label=rt.table_label,
        columns=[],
        drop_sql='DROP TABLE IF EXISTS "emp_realtime_roster" CASCADE',
        create_sql=[],
    )

    assert plan.table_name == "emp_realtime_roster"
    assert plan.table_label == "员工实时花名册"
