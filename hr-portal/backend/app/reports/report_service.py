"""报表执行服务（可被 scheduler handler 和 router 共同调用）

提取自 reports/router.py run_report 逻辑，支持：
  - 定时任务调用（无 user 对象，用 triggered_by 字符串标识）
  - 手动运行调用（有 user 对象）

返回 (total_rows, run_url)，供 handler 使用。
"""
from __future__ import annotations

import logging
from typing import Any

from fastapi import HTTPException, status
from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from app.reports.models import Report
from app.reports.validation import ensure_valid_report_config, ensure_valid_report_field_references
from app.users.models import User


logger = logging.getLogger("reports.service")


async def run_report_query(
    report: Report,
    db: AsyncSession,
    triggered_by: str = "cron",
    runtime_filters: list[dict[str, Any]] | None = None,
) -> tuple[int, str]:
    """执行报表查询，返回 (total_rows, run_url)。

    此函数不分页，返回总行数。适合定时任务场景。
    实际数据不需要返回，只记录运行结果。
    """
    from datetime import datetime
    from app.reports.config import ReportConfig
    from app.reports.runtime import apply_runtime_overrides, validate_runtime_filters
    from app.reports.sql_builder import run_dataset_query

    if report.dataset_id is None:
        raise RuntimeError(f"报表 {report.id} 未绑定数据集")

    if report.owner_id is None:
        raise RuntimeError(f'报表 {report.id} 缺少创建人，无法按报表权限范围执行')
    owner = await db.get(User, report.owner_id)
    if owner is None:
        raise RuntimeError(f'报表 {report.id} 创建人不存在，无法执行')

    try:
        config_model = ReportConfig(**(report.config or {}))
    except ValidationError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    validate_runtime_filters(config_model, runtime_filters)
    config_model = ensure_valid_report_config(apply_runtime_overrides(config_model, runtime_filters))
    await ensure_valid_report_field_references(config_model, report.dataset_id, owner, db, runtime_filters)
    config = config_model.model_dump()
    columns = config.get("columns", [])
    filters = config.get("filters", [])
    filter_logic = config.get("filter_logic")
    sorts = config.get("sorts", [])
    value_rules = config.get("value_rules", [])
    aggregate = config.get("aggregate", False)
    aggregations = config.get("aggregations", {})
    column_settings = config.get("column_settings", {})
    transpose = config.get("transpose", {})
    rounding_corrections = config.get("rounding_corrections", [])
    list_lookup = config.get("list_lookup", {})

    # 定时任务下使用 page_size=1 只获取 total，避免大量数据占内存
    warnings: list[str] = []
    _, _, total = await run_dataset_query(
        dataset_id=report.dataset_id,
        columns=columns,
        filters=filters if isinstance(filters, list) else [],
        filter_logic=filter_logic,
        sorts=sorts if isinstance(sorts, list) else [],
        value_rules=value_rules if isinstance(value_rules, list) else [],
        aggregate=aggregate,
        aggregations=aggregations if isinstance(aggregations, dict) else {},
        column_settings=column_settings if isinstance(column_settings, dict) else {},
        transpose=transpose if isinstance(transpose, dict) else {},
        rounding_corrections=rounding_corrections if isinstance(rounding_corrections, list) else [],
        list_lookup=list_lookup if isinstance(list_lookup, dict) else {},
        page=1,
        page_size=1,
        user=owner,
        db=db,
        scope_strategy=report.scope_strategy,
        warnings_sink=warnings,
    )

    # 更新 last_run_at
    from datetime import datetime, UTC
    report.last_run_at = datetime.now(UTC)
    report.run_count = (report.run_count or 0) + 1

    run_url = f"/reports/{report.id}"
    logger.info("[report_service] report %d (%s) 执行完成 total=%d", report.id, report.name, total)
    return total, run_url
