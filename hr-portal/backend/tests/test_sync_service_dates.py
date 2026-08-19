from datetime import date

from decimal import Decimal

from app.datasources.sync_service import _coerce_db_value, _normalize_db_value


def test_normalize_decimal_without_scientific_notation():
    assert _normalize_db_value(Decimal("2E+4")) == "20000"
    assert _normalize_db_value(Decimal("20000.50")) == "20000.50"


    assert _coerce_db_value(44081, "date") == date(2020, 9, 7)
    assert _coerce_db_value("44228", "date") == date(2021, 2, 1)


def test_coerce_standard_date_formats_and_empty_values():
    assert _coerce_db_value("2024-01-31", "date") == date(2024, 1, 31)
    assert _coerce_db_value("2024/01/31", "date") == date(2024, 1, 31)
    assert _coerce_db_value(None, "date") is None
    assert _coerce_db_value("", "date") is None


def test_coerce_invalid_or_non_positive_excel_date_serial_to_none():
    assert _coerce_db_value(44081.5, "date") is None
    assert _coerce_db_value(0, "date") is None
    assert _coerce_db_value(-1, "date") is None
