"""中文调度表达式 → APScheduler CronTrigger

支持的表达式（与前端 SCHEDULE_OPTIONS 对齐）：
- "每日 HH:MM"           → 每天 HH:MM
- "每周一 HH:MM" / "每周N HH:MM"  → 每周 X HH:MM（N=一/二/三/四/五/六/日 或 1-7）
- "每月 N 日 HH:MM"      → 每月 N 日 HH:MM
- "每小时整点"            → 每小时 0 分
- "手动触发"              → 返回 None（不注册到调度器）
- 原生 cron（5 段）       → 直接解析

时区：北京时间 Asia/Shanghai
"""
from __future__ import annotations

import re

from apscheduler.triggers.cron import CronTrigger


WEEKDAY_MAP = {
    "一": 0, "二": 1, "三": 2, "四": 3, "五": 4, "六": 5, "日": 6, "天": 6,
    "1": 0, "2": 1, "3": 2, "4": 3, "5": 4, "6": 5, "7": 6,
}

TZ = "Asia/Shanghai"


class ScheduleParseError(ValueError):
    pass


def parse_schedule(expr: str) -> CronTrigger | None:
    """中文表达式 → CronTrigger。返回 None 表示"手动触发"，调用方不应注册到 scheduler。

    解析失败抛 ScheduleParseError，调用方决定是降级（用日级默认）还是报错。
    """
    if not expr:
        raise ScheduleParseError("调度表达式为空")
    s = expr.strip()

    if s == "手动触发":
        return None

    # 原生 5 段 cron（兼容老配置）
    if len(s.split()) == 5 and "每" not in s:
        try:
            return CronTrigger.from_crontab(s, timezone=TZ)
        except Exception as e:
            raise ScheduleParseError(f"非法 cron 表达式: {s}") from e

    # 每小时整点
    if s == "每小时整点":
        return CronTrigger(minute=0, timezone=TZ)

    # 每日 HH:MM
    m = re.match(r"^每日\s*(\d{1,2}):(\d{1,2})$", s)
    if m:
        h, mi = int(m.group(1)), int(m.group(2))
        return CronTrigger(hour=h, minute=mi, timezone=TZ)

    # 每周X HH:MM
    m = re.match(r"^每周([一二三四五六日天1-7])\s*(\d{1,2}):(\d{1,2})$", s)
    if m:
        wd = WEEKDAY_MAP.get(m.group(1))
        if wd is None:
            raise ScheduleParseError(f"非法星期: {s}")
        h, mi = int(m.group(2)), int(m.group(3))
        return CronTrigger(day_of_week=wd, hour=h, minute=mi, timezone=TZ)

    # 每月 N 日 HH:MM
    m = re.match(r"^每月\s*(\d{1,2})\s*日\s*(\d{1,2}):(\d{1,2})$", s)
    if m:
        d, h, mi = int(m.group(1)), int(m.group(2)), int(m.group(3))
        return CronTrigger(day=d, hour=h, minute=mi, timezone=TZ)

    raise ScheduleParseError(f"暂不支持的调度表达式: {s}")
