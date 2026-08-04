"""运行时解析多月对比的期间范围。"""
from __future__ import annotations

from datetime import datetime
from zoneinfo import ZoneInfo

from app.data_compare.schemas import PeriodRange, PeriodResolution

BUSINESS_TIMEZONE = "Asia/Shanghai"
DEFAULT_MAX_PERIODS = 12


class PeriodResolutionError(ValueError):
    pass


def _month_number(period: str) -> int:
    return int(period[:4]) * 12 + int(period[4:]) - 1


def _month_text(number: int) -> str:
    year, month_index = divmod(number, 12)
    return f"{year:04d}{month_index + 1:02d}"


def resolve_period_range(
    period_range: PeriodRange,
    *,
    now: datetime | None = None,
    max_periods: int = DEFAULT_MAX_PERIODS,
) -> PeriodResolution:
    tz = ZoneInfo(BUSINESS_TIMEZONE)
    resolved_at = (now or datetime.now(tz)).astimezone(tz)
    current_month = f"{resolved_at.year:04d}{resolved_at.month:02d}"
    end = current_month if period_range.end == "current_month" else period_range.end

    start_number = _month_number(period_range.start)
    end_number = _month_number(end)
    current_number = _month_number(current_month)
    if start_number > end_number:
        raise PeriodResolutionError("开始月份不得晚于结束月份")
    if end_number > current_number:
        raise PeriodResolutionError("结束月份不得晚于自然月当前月")

    periods = [_month_text(value) for value in range(start_number, end_number + 1)]
    if len(periods) > max_periods:
        raise PeriodResolutionError(f"期间范围超过单次执行上限 {max_periods} 个月")

    return PeriodResolution(
        requested=period_range,
        resolved_at=resolved_at,
        timezone=BUSINESS_TIMEZONE,
        resolved_periods=periods,
    )
