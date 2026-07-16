# -*- coding: utf-8 -*-
"""AST0008：Excel 条件语义编译单元测试（不依赖数据库）。

直接对 compile_criterion 做单元验证，覆盖第 8 章全部规则。
"""
from app.ai_formula.ast import compile_criterion


def test_wildcard_star():
    sql, warns = compile_criterion('"c"."x"', "*")
    assert "IS NOT NULL" in sql
    assert "::text <> ''" in sql
    assert warns == []


def test_prefix_wildcard():
    sql, _ = compile_criterion('"c"."x"', "正式*")
    assert "LIKE" in sql
    assert "正式%" in sql
    assert "ESCAPE" in sql


def test_suffix_and_single():
    sql_a, _ = compile_criterion('"c"."x"', "*员工")
    assert "%员工" in sql_a
    sql_b, _ = compile_criterion('"c"."x"', "?式员工")
    assert "_式员工" in sql_b


def test_numeric_with_type():
    sql, warns = compile_criterion('"c"."x"', ">=100", data_type="number")
    assert sql == '"c"."x" >= 100'
    assert warns == []


def test_numeric_inferred_warning():
    sql, warns = compile_criterion('"c"."x"', ">=100")
    assert '"c"."x" >= 100' in sql
    assert any(w.code == "criteria_type_inferred" for w in warns)


def test_not_equal_with_null():
    sql, _ = compile_criterion('"c"."x"', "<>正式员工")
    assert " <> '正式员工'" in sql
    assert 'OR "c"."x" IS NULL' in sql


def test_date_with_type():
    sql, warns = compile_criterion('"c"."x"', ">=2026-01-01", data_type="date")
    assert "DATE '2026-01-01'" in sql
    assert warns == []


def test_date_inferred_warning():
    sql, warns = compile_criterion('"c"."x"', ">=2026-01-01")
    assert "DATE '2026-01-01'" in sql
    assert any(w.code == "criteria_type_inferred" for w in warns)


def test_equal_empty():
    sql, _ = compile_criterion('"c"."x"', "=")
    assert "IS NULL" in sql
    assert "::text = ''" in sql


def test_not_equal_empty():
    sql, _ = compile_criterion('"c"."x"', "<>")
    assert "IS NOT NULL" in sql
    assert "::text <> ''" in sql


def test_exact_text():
    sql, _ = compile_criterion('"c"."x"', "正式员工")
    assert sql == '"c"."x" = \'正式员工\''
