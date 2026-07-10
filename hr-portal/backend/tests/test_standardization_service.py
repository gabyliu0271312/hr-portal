# -*- coding: utf-8 -*-
"""Tests for warehouse standardization service helpers."""

from datetime import UTC, date, datetime, timezone
from decimal import Decimal

from app.warehouse.service.standardization import (
    DEFAULT_INSERT_BATCH_ROWS,
    MAX_INSERT_BIND_PARAMS,
    _coerce_insert_value,
    _dwd_create_column_definitions,
    _dwd_source_field_map,
    _rule_output_labels,
    _infer_column_types,
    _infer_sql_type,
    _is_system_technical_column,
    _ordered_output_columns,
    _quote_ident,
    _safe_insert_batch_size,
    _to_table_column_data_type,
    _normalize_standardization_rules,
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

class _Rule:
    def __init__(self, rule_type, source_field, target_field, rule_config=None):
        self.rule_type = rule_type
        self.source_field = source_field
        self.target_field = target_field
        self.rule_config = rule_config or {}


def test_dwd_source_field_map_keeps_unchanged_columns_and_maps_renames():
    rules = [
        _Rule("rename", "employee_no", "emp_no"),
        _Rule("value_map", "status", "status_label"),
    ]

    assert _dwd_source_field_map(["id", "employee_no", "full_name", "status"], rules) == {
        "id": "id",
        "full_name": "full_name",
        "status": "status",
        "emp_no": "employee_no",
        "status_label": "status",
    }


def test_rule_output_labels_uses_rule_config_for_overrides():
    rules = [
        _Rule("rename", "employee_no", "emp_no", {"output_label": "\u5458\u5de5\u7f16\u53f7"}),
        _Rule(
            "split_merge",
            "full_name",
            "",
            {"action": "split", "target_fields": ["first_name"], "output_labels": {"first_name": "?"}},
        ),
    ]

    assert _rule_output_labels(rules) == {"emp_no": "\u5458\u5de5\u7f16\u53f7", "first_name": "?"}

def test_system_technical_columns_are_detected_for_default_hidden_metadata():
    assert _is_system_technical_column("id") is True
    assert _is_system_technical_column("pk_hash") is True
    assert _is_system_technical_column("synced_at") is True
    assert _is_system_technical_column("full_name") is False




def test_normalize_legacy_rename_label_to_stable_employee_no_code():
    rules = [_Rule("rename", "\u5de5\u53f7", "\u5de5\u53f7")]

    normalized = _normalize_standardization_rules(
        rules,
        source_columns=["employee_no", "amount"],
        source_label_by_code={"employee_no": "\u5de5\u53f7"},
    )

    assert normalized[0].source_field == "employee_no"
    assert normalized[0].target_field == "employee_no"
    assert normalized[0].rule_config["output_label"] == "\u5de5\u53f7"


def test_normalize_chinese_physical_source_renames_to_stable_employee_no_code():
    rules = [_Rule("rename", "\u5de5\u53f7", "\u5de5\u53f7")]

    normalized = _normalize_standardization_rules(
        rules,
        source_columns=["\u5de5\u53f7", "amount"],
        source_label_by_code={"\u5de5\u53f7": "\u5de5\u53f7"},
    )

    assert normalized[0].source_field == "\u5de5\u53f7"
    assert normalized[0].target_field == "employee_no"
    assert normalized[0].rule_config["output_label"] == "\u5de5\u53f7"


def test_normalize_legacy_rename_label_to_stable_month_code():
    rules = [_Rule("rename", "\u6708\u4efd", "\u6708\u4efd")]

    normalized = _normalize_standardization_rules(
        rules,
        source_columns=["month", "cost"],
        source_label_by_code={"month": "\u6708\u4efd"},
    )

    assert normalized[0].source_field == "month"
    assert normalized[0].target_field == "month"
    assert normalized[0].rule_config["output_label"] == "\u6708\u4efd"


def test_normalize_keeps_explicit_ascii_new_target_code():
    rules = [_Rule("rename", "\u5de5\u53f7", "emp_no", {"output_label": "\u5458\u5de5\u7f16\u53f7"})]

    normalized = _normalize_standardization_rules(
        rules,
        source_columns=["employee_no"],
        source_label_by_code={"employee_no": "\u5de5\u53f7"},
    )

    assert normalized[0].source_field == "employee_no"
    assert normalized[0].target_field == "emp_no"
    assert normalized[0].rule_config["output_label"] == "\u5458\u5de5\u7f16\u53f7"
