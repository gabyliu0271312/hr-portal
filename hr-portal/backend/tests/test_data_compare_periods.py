from datetime import datetime

import pytest

from app.data_compare.periods import PeriodResolutionError, resolve_period_range
from app.data_compare.schemas import PeriodRange


def test_resolve_current_month_in_shanghai_timezone():
    result = resolve_period_range(
        PeriodRange(start="202601", end="current_month"),
        now=datetime.fromisoformat("2026-08-04T01:00:00+00:00"),
    )

    assert result.timezone == "Asia/Shanghai"
    assert result.resolved_periods == ["202601", "202602", "202603", "202604", "202605", "202606", "202607", "202608"]


def test_resolve_cross_year_fixed_range():
    result = resolve_period_range(
        PeriodRange(start="202511", end="202602"),
        now=datetime.fromisoformat("2026-08-04T09:00:00+08:00"),
    )

    assert result.resolved_periods == ["202511", "202512", "202601", "202602"]


@pytest.mark.parametrize("period_range", [
    PeriodRange(start="202607", end="202606"),
    PeriodRange(start="202601", end="202609"),
])
def test_rejects_invalid_resolved_range(period_range):
    with pytest.raises(PeriodResolutionError):
        resolve_period_range(period_range, now=datetime.fromisoformat("2026-08-04T09:00:00+08:00"))


def test_rejects_period_count_above_limit():
    with pytest.raises(PeriodResolutionError):
        resolve_period_range(
            PeriodRange(start="202501", end="202608"),
            now=datetime.fromisoformat("2026-08-04T09:00:00+08:00"),
            max_periods=12,
        )
