# -*- coding: utf-8 -*-
"""Tests for warehouse standardization service helpers."""

from app.warehouse.service.standardization import (
    DEFAULT_INSERT_BATCH_ROWS,
    MAX_INSERT_BIND_PARAMS,
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
