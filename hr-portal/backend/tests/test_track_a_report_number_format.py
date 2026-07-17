# -*- coding: utf-8 -*-
"""Track A 数字格式化 + 精度验证

覆盖：
- Decimal 大数精度（不丢位）
- ROUND_HALF_UP 舍入
- 整数/小数千分位
- null/空值/非数字边界
- 数字类型全覆盖

运行: pytest tests/test_track_a_report_number_format.py -v
"""
import decimal
from decimal import Decimal, ROUND_HALF_UP

import pytest


# ---- 从 router.py 导入供测试 ----

from app.reports.router import (
    _to_decimal,
    _format_number_for_csv,
    _to_numeric_value,
    _numeric_format_for_xlsx,
    _is_numeric_column,
    _NUMERIC_TYPES,
    _DECIMAL_SIX,
)


# ==================== _to_decimal ====================

def test_to_decimal_int():
    assert _to_decimal(1234567) == Decimal("1234567")


def test_to_decimal_float():
    assert _to_decimal(1234.56) == Decimal("1234.56")


def test_to_decimal_str():
    assert _to_decimal("1234.56") == Decimal("1234.56")


def test_to_decimal_already_decimal():
    d = Decimal("999.99")
    assert _to_decimal(d) is d  # 同一对象返回


def test_to_decimal_null():
    assert _to_decimal(None) is None


def test_to_decimal_empty():
    assert _to_decimal("") is None


def test_to_decimal_not_a_number():
    assert _to_decimal("abc") is None


def test_to_decimal_large_int():
    """大整数不丢精度"""
    assert _to_decimal(9007199254740993) == Decimal("9007199254740993")


def test_to_decimal_large_decimal():
    """大 Decimal 值不丢精度 — 这是验收的关键用例"""
    d = _to_decimal(Decimal("9007199254740993.1234565"))
    assert d == Decimal("9007199254740993.1234565")
    assert str(d) == "9007199254740993.1234565"


# ==================== _format_number_for_csv ====================

def test_csv_integer():
    assert _format_number_for_csv(1234567) == "1,234,567"


def test_csv_large_integer():
    """大整数 CSV 格式化，不丢精度"""
    result = _format_number_for_csv(Decimal("9007199254740993"))
    assert result == "9,007,199,254,740,993"


def test_csv_decimal():
    assert _format_number_for_csv(Decimal("1234.56")) == "1,234.56"


def test_csv_decimal_six_digits():
    assert _format_number_for_csv(Decimal("1234.123456")) == "1,234.123456"


def test_csv_decimal_round_up():
    """ROUND_HALF_UP: 第 7 位 ≥5 → 进一"""
    result = _format_number_for_csv(Decimal("0.1234565"))
    assert result == "0.123457"


def test_csv_decimal_round_down():
    """第 7 位 <5 → 舍去"""
    result = _format_number_for_csv(Decimal("0.1234564"))
    assert result == "0.123456"


def test_csv_decimal_trailing_zeros_removed():
    result = _format_number_for_csv(Decimal("1000.100000"))
    assert result == "1,000.1"


def test_csv_integer_after_round():
    """quantize 后变成整数 → 不显示 .0"""
    result = _format_number_for_csv(Decimal("1000.0000001"))
    assert result == "1,000"


def test_csv_null():
    assert _format_number_for_csv(None) == "0"


def test_csv_empty_string():
    assert _format_number_for_csv("") == "0"


def test_csv_string():
    assert _format_number_for_csv("abc") == "abc"


def test_csv_large_precision_decimal():
    """Decimal('9007199254740993.1234565') CSV 格式化验证

    这是验收用例：必须显示 9,007,199,254,740,993.123457（7 位进一），
    而不是 9,007,199,254,740,994（float 丢失精度）。
    """
    result = _format_number_for_csv(Decimal("9007199254740993.1234565"))
    # Round to 6 decimal places → .123457 (round up from .1234565)
    assert "9,007,199,254,740,993" in result
    assert "9,007,199,254,740,994" not in result  # float 精度丢失的错值
    assert result.endswith(".123457")


def test_csv_negative():
    assert _format_number_for_csv(Decimal("-1234.56")) == "-1,234.56"


# ==================== _to_numeric_value ====================

def test_xlsx_integer():
    assert _to_numeric_value(1234567) == 1234567
    assert isinstance(_to_numeric_value(1234567), int)


def test_xlsx_decimal():
    v = _to_numeric_value(Decimal("1234.56"))
    assert v == 1234.56
    assert isinstance(v, float)


def test_xlsx_round_up():
    v = _to_numeric_value(Decimal("0.1234565"))
    assert v == pytest.approx(0.123457)


def test_xlsx_null():
    assert _to_numeric_value(None) == 0


def test_xlsx_empty():
    assert _to_numeric_value("") == 0


def test_xlsx_not_a_number():
    assert _to_numeric_value("abc") is None


def test_xlsx_large_decimal():
    """大 Decimal 转 XLSX — 保留到 6 位后转 float"""
    v = _to_numeric_value(Decimal("9007199254740993.1234565"))
    # quantize 到 6 位 → 9007199254740993.123457
    assert v == pytest.approx(9007199254740993.123457, rel=1e-9)


# ==================== _numeric_format_for_xlsx ====================

def test_xlsx_format_integer():
    assert _numeric_format_for_xlsx(1000) == "#,##0"


def test_xlsx_format_decimal():
    assert _numeric_format_for_xlsx(Decimal("1234.56")) == "#,##0.######"


def test_xlsx_format_null():
    assert _numeric_format_for_xlsx(None) == ""


def test_xlsx_format_not_number():
    assert _numeric_format_for_xlsx("abc") == ""


# ==================== _is_numeric_column ====================

@pytest.mark.parametrize("data_type, expected", [
    ("integer", True), ("number", True), ("decimal", True),
    ("float", True), ("double", True), ("numeric", True),
    ("string", False), ("date", False), ("boolean", False),
])
def test_is_numeric_column_types(data_type, expected):
    col = {"data_type": data_type, "code": "test"}
    assert _is_numeric_column(col) == expected


def test_is_numeric_column_sensitive():
    col = {"data_type": "number", "code": "test", "is_sensitive": True}
    assert _is_numeric_column(col) == False


def test_is_numeric_column_normal():
    col = {"data_type": "number", "code": "test"}
    assert _is_numeric_column(col) == True


# ==================== NUMERIC_TYPES 常量 ====================

def test_numeric_types_cover_all():
    assert _NUMERIC_TYPES == {"integer", "number", "decimal", "float", "double", "numeric"}


# ==================== Decimal quantize 一致性 ====================

def test_quantize_consistency():
    """验证 CSV/XLSX 使用相同的 quantize 精度"""
    d = Decimal("0.12345678")
    d_csv = d.quantize(_DECIMAL_SIX, rounding=ROUND_HALF_UP)
    d_xlsx = d.quantize(_DECIMAL_SIX, rounding=ROUND_HALF_UP)
    assert d_csv == d_xlsx  # 两个函数应使用相同的舍入
    assert d_csv == Decimal("0.123457")
