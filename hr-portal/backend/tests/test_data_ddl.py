import pytest

from app.data.ddl import (
    DDLValidationError,
    SourceColumn,
    build_add_source_column_sql,
    build_alter_source_column_type_sql,
    build_create_source_table_sql,
    build_drop_source_column_sql,
    build_drop_source_table_sql,
    make_identifier,
    postgres_type,
    quote_ident,
    validate_column_name,
    validate_table_name,
)


def test_validate_table_name_accepts_safe_source_table_names():
    assert validate_table_name("emp_monthly_salary") == "emp_monthly_salary"
    assert validate_table_name("a1_b2") == "a1_b2"


@pytest.mark.parametrize(
    "name",
    ["", "EmpMonthlySalary", "1_table", "table-name", 'x";drop table users;--'],
)
def test_validate_table_name_rejects_unsafe_names(name):
    with pytest.raises(DDLValidationError):
        validate_table_name(name)


def test_validate_column_name_accepts_system_injected_underscore_columns():
    assert validate_column_name("_org_node_code") == "_org_node_code"
    assert validate_column_name("base_salary") == "base_salary"


@pytest.mark.parametrize("name", ["id", "pk_hash", "synced_at"])
def test_validate_column_name_protects_base_columns(name):
    with pytest.raises(DDLValidationError):
        validate_column_name(name)


@pytest.mark.parametrize(
    ("data_type", "pg_type"),
    [
        ("string", "TEXT"),
        ("text", "TEXT"),
        ("number", "NUMERIC"),
        ("integer", "INTEGER"),
        ("date", "DATE"),
        ("datetime", "TIMESTAMPTZ"),
        ("boolean", "BOOLEAN"),
        ("bool", "BOOLEAN"),
        ("enum", "TEXT"),
        (None, "TEXT"),
    ],
)
def test_postgres_type_maps_table_column_types(data_type, pg_type):
    assert postgres_type(data_type) == pg_type


def test_postgres_type_rejects_unknown_type():
    with pytest.raises(DDLValidationError):
        postgres_type("money")


def test_quote_identifier_validates_before_quoting():
    assert quote_ident("emp_monthly_salary", kind="table") == '"emp_monthly_salary"'
    with pytest.raises(DDLValidationError):
        quote_ident("bad-name", kind="table")


def test_make_identifier_keeps_postgres_identifier_limit():
    table_name = "a" * 63
    value = make_identifier("ix_", table_name, "_pk_hash")
    assert len(value.encode("utf-8")) <= 63
    assert value.startswith("ix_")


def test_build_create_source_table_sql_creates_base_columns_and_business_columns():
    stmts = build_create_source_table_sql(
        "emp_monthly_salary",
        [
            SourceColumn("employee_no", "string"),
            SourceColumn("base_salary", "number"),
            {"column_code": "hire_date", "data_type": "date"},
        ],
    )

    assert len(stmts) == 2
    create_sql, index_sql = stmts
    assert 'CREATE TABLE IF NOT EXISTS "emp_monthly_salary"' in create_sql
    assert "id BIGSERIAL PRIMARY KEY" in create_sql
    assert "pk_hash VARCHAR(64) NOT NULL" in create_sql
    assert "synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()" in create_sql
    assert '"employee_no" TEXT' in create_sql
    assert '"base_salary" NUMERIC' in create_sql
    assert '"hire_date" DATE' in create_sql
    assert "raw" not in create_sql
    assert 'CREATE INDEX IF NOT EXISTS "ix_emp_monthly_salary_pk_hash"' in index_sql
    assert 'ON "emp_monthly_salary" (pk_hash)' in index_sql


def test_build_create_source_table_sql_rejects_duplicate_columns():
    with pytest.raises(DDLValidationError):
        build_create_source_table_sql(
            "emp_monthly_salary",
            [SourceColumn("employee_no"), SourceColumn("employee_no")],
        )


def test_build_column_operation_sql():
    assert (
        build_add_source_column_sql("emp_monthly_salary", "base_salary", "number")
        == 'ALTER TABLE "emp_monthly_salary" ADD COLUMN IF NOT EXISTS "base_salary" NUMERIC'
    )
    assert (
        build_drop_source_column_sql("emp_monthly_salary", "base_salary")
        == 'ALTER TABLE "emp_monthly_salary" DROP COLUMN IF EXISTS "base_salary"'
    )
    assert (
        build_alter_source_column_type_sql("emp_monthly_salary", "base_salary", "number")
        == 'ALTER TABLE "emp_monthly_salary" ALTER COLUMN "base_salary" TYPE NUMERIC'
    )
    assert (
        build_alter_source_column_type_sql(
            "emp_monthly_salary",
            "base_salary",
            "number",
            using_expr='NULLIF("base_salary", \'\')::numeric',
        )
        == 'ALTER TABLE "emp_monthly_salary" ALTER COLUMN "base_salary" TYPE NUMERIC '
        'USING NULLIF("base_salary", \'\')::numeric'
    )


def test_build_drop_source_table_sql_supports_optional_cascade():
    assert (
        build_drop_source_table_sql("emp_monthly_salary")
        == 'DROP TABLE IF EXISTS "emp_monthly_salary"'
    )
    assert (
        build_drop_source_table_sql("emp_monthly_salary", cascade=True)
        == 'DROP TABLE IF EXISTS "emp_monthly_salary" CASCADE'
    )
