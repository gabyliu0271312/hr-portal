"""Disabled stub for the retired allocation config code migration.

The current system only supports entity-column source tables and current
English field codes. This module is kept so old import paths fail closed with a
clear message instead of running archived migration logic.
"""

from __future__ import annotations

DISABLED_MESSAGE = (
    "scripts.migrate_allocation_schemes 已禁用：当前系统只允许实体列业务表，"
    "旧字段编码迁移不允许执行。请使用实体列 DDL、报表配置维护或重建工具处理。"
)


async def main() -> None:
    raise SystemExit(DISABLED_MESSAGE)


if __name__ == "__main__":
    import asyncio

    asyncio.run(main())
