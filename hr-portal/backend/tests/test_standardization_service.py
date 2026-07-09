# -*- coding: utf-8 -*-
"""Tests for warehouse standardization service helpers."""

from datetime import date, datetime

from app.warehouse.service.standardization import (
    DEFAULT_INSERT_BATCH_ROWS,
    MAX_INSERT_BIND_PARAMS,
    _coerce_insert_value,
    _infer_column_types,
    _infer_sql_type,
    _safe_insert_batch_size,
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
    assert _infer_sql_type(datetime(2026, 7, 2, 2, 5, 18)) == "TIMESTAMP"
    assert _infer_sql_type(date(2026, 7, 2)) == "DATE"


def test_infer_column_types_uses_first_non_null_value():
    rows = [
        {"synced_at": None, "full_name": "Alice"},
        {"synced_at": datetime(2026, 7, 2, 2, 5, 18), "full_name": "Bob"},
    ]

    assert _infer_column_types(rows)["synced_at"] == "TIMESTAMP"
    assert _infer_column_types(rows)["full_name"] == "TEXT"


def test_coerce_insert_value_converts_datetime_when_column_is_text():
    value = datetime(2026, 7, 2, 2, 5, 18)

    assert _coerce_insert_value(value, "TEXT") == "2026-07-02T02:05:18"
    assert _coerce_insert_value(value, "TIMESTAMP") is value
