# -*- coding: utf-8 -*-
"""Tests for warehouse standardization service helpers."""

from datetime import UTC, date, datetime, timezone
from decimal import Decimal

from app.warehouse.service.standardization import (
    DEFAULT_INSERT_BATCH_ROWS,
    MAX_INSERT_BIND_PARAMS,
    _coerce_insert_value,
    _dwd_create_column_definitions,
    _infer_column_types,
    _infer_sql_type,
    _ordered_output_columns,
    _quote_ident,
    _safe_insert_batch_size,
    _to_table_column_data_type,
)


def test_safe_insert_batch_size_keeps_default_for_narrow_tables():
    assert _safe_insert_batch_size(10) == DEFAULT_INSERT_BATCH_ROWS


def test_safe_insert_batch_size_caps_wide_tables_under_asyncpg_limit():
    column_count = 64
    batch_size = _safe_insert_batch_size(column_count)

    assert batch_size < DEFAULT_INSERT_BATCH_ROWS
    assert batch_size * column_count <= MAX_INSERT_BIND_PARAMS


def test_safe_insert_batch_size_never_returns_zero():
    assert _safe_insert_batch_size(0) == 1
    assert _safe_insert_batch_size(50000) == 1


def test_infer_sql_type_supports_datetime_and_date():
    assert _infer_sql_type(datetime(2026, 7, 2, 2, 5, 18, tzinfo=UTC)) == "TIMESTAMPTZ"
    assert _infer_sql_type(datetime(2026, 7, 2, 2, 5, 18)) == "TIMESTAMP"
    assert _infer_sql_type(date(2026, 7, 2)) == "DATE"
    assert _infer_sql_type(Decimal("12.30")) == "NUMERIC"


def test_infer_column_types_uses_first_non_null_value():
    rows = [
        {"synced_at": None, "full_name": "Alice"},
        {"synced_at": datetime(2026, 7, 2, 2, 5, 18, tzinfo=UTC), "full_name": "Bob"},
    ]

    assert _infer_column_types(rows)["synced_at"] == "TIMESTAMPTZ"
    assert _infer_column_types(rows)["full_name"] == "TEXT"


def test_infer_column_types_prefers_timestamptz_for_mixed_datetime_awareness():
    rows = [
        {"synced_at": datetime(2026, 7, 2, 2, 5, 18)},
        {"synced_at": datetime(2026, 7, 2, 2, 5, 18, tzinfo=timezone.utc)},
    ]

    assert _infer_column_types(rows)["synced_at"] == "TIMESTAMPTZ"


def test_infer_column_types_promotes_mixed_non_compatible_values_to_text():
    rows = [
        {"flag_or_text": True},
        {"flag_or_text": "yes"},
    ]

    assert _infer_column_types(rows)["flag_or_text"] == "TEXT"


def test_ordered_output_columns_includes_columns_added_by_later_rows():
    rows = [
        {"id": 1, "name": "Alice"},
        {"id": 2, "name": "Bob", "name_type_error": True},
    ]

    assert _ordered_output_columns(rows) == ["id", "name", "name_type_error"]
    assert _infer_column_types(rows)["name_type_error"] == "BOOLEAN"


def test_coerce_insert_value_converts_datetime_when_column_is_text():
    value = datetime(2026, 7, 2, 2, 5, 18)

    assert _coerce_insert_value(value, "TEXT") == "2026-07-02T02:05:18"
    assert _coerce_insert_value(value, "TIMESTAMP") is value


def test_coerce_insert_value_handles_timestamptz_values():
    naive = datetime(2026, 7, 2, 2, 5, 18)
    aware = datetime(2026, 7, 2, 2, 5, 18, tzinfo=UTC)

    coerced_naive = _coerce_insert_value(naive, "TIMESTAMPTZ")
    assert coerced_naive.tzinfo is not None
    assert coerced_naive.utcoffset() is not None
    assert _coerce_insert_value(aware, "TIMESTAMPTZ") is aware


def test_coerce_insert_value_handles_timestamp_values():
    aware = datetime(2026, 7, 2, 2, 5, 18, tzinfo=UTC)
    coerced = _coerce_insert_value(aware, "TIMESTAMP")

    assert coerced.tzinfo is None
    assert coerced == datetime(2026, 7, 2, 2, 5, 18)


def test_quote_ident_escapes_embedded_quotes():
    assert _quote_ident('bad"name') == '"bad""name"'


def test_to_table_column_data_type_maps_physical_types():
    assert _to_table_column_data_type("TIMESTAMPTZ") == "datetime"
    assert _to_table_column_data_type("TIMESTAMP") == "datetime"
    assert _to_table_column_data_type("DATE") == "date"
    assert _to_table_column_data_type("NUMERIC") == "number"
    assert _to_table_column_data_type("DOUBLE PRECISION") == "number"
    assert _to_table_column_data_type("BOOLEAN") == "bool"
    assert _to_table_column_data_type("TEXT") == "string"

def test_dwd_create_column_definitions_marks_source_id_as_primary_key():
    columns = ["id", "full_name"]
    column_types = {"id": "BIGINT", "full_name": "TEXT"}

    assert _dwd_create_column_definitions(columns, column_types) == [
        '"id" BIGINT PRIMARY KEY',
        '"full_name" TEXT',
    ]


def test_dwd_create_column_definitions_adds_synthetic_primary_key_when_missing():
    columns = ["full_name", "synced_at"]
    column_types = {"full_name": "TEXT", "synced_at": "TIMESTAMPTZ"}

    assert _dwd_create_column_definitions(columns, column_types) == [
        '"id" BIGSERIAL PRIMARY KEY',
        '"full_name" TEXT',
        '"synced_at" TIMESTAMPTZ',
    ]

