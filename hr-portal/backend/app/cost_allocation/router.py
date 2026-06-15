"""成本分摊存档路由

POST /cost-allocation/archive
  - 运行指定报表（全量）
  - 将结果行注入 month 字段后写入 emp_monthly_cost_result
  - 月度表主键规则：upsert + 只删当月孤儿，历史月份保留
"""
from __future__ import annotations

from datetime import datetime, UTC
from urllib.parse import urljoin

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.db import get_session
from app.core.deps import current_user, require_op
from app.reports.models import Report
from app.reports.router import ReportConfig
from app.datasources.sync_service import _dynamic_upsert
from app.users.models import User

router = APIRouter(prefix="/cost-allocation", tags=["cost-allocation"])

RESULT_TABLE = "emp_monthly_cost_result"


def _archive_label_map(columns_meta: list[dict]) -> dict[str, str]:
    labels: dict[str, str] = {}
    for col in columns_meta:
        code = str(col.get("code") or "")
        label = str(col.get("label") or "")
        if not code or not label:
            continue
        archive_code = code.split(".", 1)[1] if "." in code else code
        labels.setdefault(archive_code, label)
    return labels


class ArchiveIn(BaseModel):
    report_id: int
    period_ym: str  # YYYYMM，如 "202506"


class ArchiveOut(BaseModel):
    archived: int
    period_ym: str
    archived_at: str


class ExternalSsoUrlOut(BaseModel):
    url: str
    target_url: str


def _join_external_url(path: str = "") -> str:
    base = settings.COST_ALLOCATION_APP_URL.rstrip("/") + "/"
    return urljoin(base, path.lstrip("/"))


@router.get("/external-sso-url", response_model=ExternalSsoUrlOut)
async def external_sso_url(
    entry_type: str = Query(default="app", pattern="^(app|admin)$"),
    user: User = Depends(require_op("cost_allocation.app", "V")),
    db: AsyncSession = Depends(get_session),
) -> ExternalSsoUrlOut:
    if entry_type == "admin":
        # 后台入口本身还需 HR Portal 的后台入口权限。
        admin_dep = require_op("cost_allocation.admin", "V")
        await admin_dep(user=user, db=db)

    target_path = settings.COST_ALLOCATION_ADMIN_PATH if entry_type == "admin" else ""
    target_url = _join_external_url(target_path)
    login_url = _join_external_url("/login")
    api_url = _join_external_url("/api/v1/auth/feishu/url")

    try:
        async with httpx.AsyncClient(timeout=8) as client:
            resp = await client.get(api_url, params={"redirect_uri": login_url})
            resp.raise_for_status()
            data = resp.json()
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="获取成本分摊飞书登录地址失败，请确认生产系统可访问",
        ) from exc

    url = data.get("url")
    if not url:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="成本分摊系统未返回飞书登录地址",
        )

    return ExternalSsoUrlOut(url=url, target_url=target_url)


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

    if r.dataset_id is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="报表必须绑定数据集")

    # 2) 全量运行（page_size=0 → 不限页）
    from app.reports.sql_builder import run_dataset_query
    cols_meta, items, _ = await run_dataset_query(
        dataset_id=r.dataset_id,
        columns=cfg.columns,
        filters=[f.model_dump() for f in cfg.filters],
        filter_logic=cfg.filter_logic,
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

    # 空批次保护
    if not items:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="报表无数据，存档中止（空批次保护）",
        )

    # 3) 构造写入行：过滤内部字段，注入月份(结果表期间列=month)
    period_ym = payload.period_ym
    rows = []
    for item in items:
        row = {k: v for k, v in item.items() if not k.startswith("_")}
        row.setdefault("month", period_ym)
        rows.append(row)

    # 4) upsert + 删当月孤儿（sync_service 统一逻辑）
    archived = await _dynamic_upsert(
        RESULT_TABLE,
        rows,
        db,
        period_ym=period_ym,
        column_labels=_archive_label_map(cols_meta),
    )
    await db.commit()

    return ArchiveOut(
        archived=archived,
        period_ym=period_ym,
        archived_at=datetime.now(UTC).isoformat(),
    )
