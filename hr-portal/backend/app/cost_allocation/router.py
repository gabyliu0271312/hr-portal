"""成本分摊存档路由

POST /cost-allocation/archive
  - 运行指定报表（全量）
  - 将结果行注入「月份」字段后写入 emp_monthly_cost_result
  - 月度表主键规则：upsert + 只删当月孤儿，历史月份保留
"""
from __future__ import annotations

from datetime import datetime, UTC

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.core.deps import current_user, require_op
from app.reports.models import Report
from app.reports.router import ReportConfig, _run_query
from app.datasources.sync_service import _dynamic_upsert
from app.users.models import User

router = APIRouter(prefix="/cost-allocation", tags=["cost-allocation"])

RESULT_TABLE = "emp_monthly_cost_result"


class ArchiveIn(BaseModel):
    report_id: int
    period_ym: str  # YYYYMM，如 "202506"


class ArchiveOut(BaseModel):
    archived: int
    period_ym: str
    archived_at: str


@router.post(
    "/archive",
    response_model=ArchiveOut,
    dependencies=[Depends(require_op("tools.cost_allocation", "C"))],
)
async def archive_cost_allocation(
    payload: ArchiveIn,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> ArchiveOut:
    # 1) 加载报表
    r = await db.get(Report, payload.report_id)
    if r is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="报表不存在")

    cfg = ReportConfig(**(r.config or {}))

    # 2) 全量运行（page_size=0 → 不限页）
    if r.dataset_id is not None:
        from app.reports.sql_builder import run_dataset_query
        cols_meta, items, _ = await run_dataset_query(
            dataset_id=r.dataset_id,
            columns=cfg.columns,
            filters=[f.model_dump() for f in cfg.filters],
            sorts=[s.model_dump() for s in cfg.sorts],
            value_rules=cfg.value_rules,
            aggregate=cfg.aggregate,
            aggregations=cfg.aggregations,
            transpose=cfg.transpose,
            rounding_corrections=cfg.rounding_corrections,
            page=1,
            page_size=0,
            user=user,
            db=db,
        )
    else:
        if not r.table_name:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="报表未配置数据来源")
        cols_meta, items, _ = await _run_query(
            db, r.table_name, cfg, page=1, page_size=0, user=user
        )

    # 空批次保护
    if not items:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="报表无数据，存档中止（空批次保护）",
        )

    # 3) 构造写入行：过滤内部字段，注入月份
    period_ym = payload.period_ym
    rows = []
    for item in items:
        row = {k: v for k, v in item.items() if not k.startswith("_")}
        row.setdefault("月份", period_ym)
        rows.append(row)

    # 4) upsert + 删当月孤儿（sync_service 统一逻辑）
    archived = await _dynamic_upsert(RESULT_TABLE, rows, db, period_ym=period_ym)
    await db.commit()

    return ArchiveOut(
        archived=archived,
        period_ym=period_ym,
        archived_at=datetime.now(UTC).isoformat(),
    )
