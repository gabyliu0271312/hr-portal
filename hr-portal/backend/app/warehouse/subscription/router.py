# -*- coding: utf-8 -*-
"""订阅管理 — CRUD + 手动触发 + 执行历史

GET    /subscriptions              — 列表
POST   /subscriptions              — 创建
GET    /subscriptions/{id}         — 详情
PUT    /subscriptions/{id}         — 更新
DELETE /subscriptions/{id}         — 删除
POST   /subscriptions/{id}/toggle  — 启用/暂停
POST   /subscriptions/{id}/run     — 手动触发一次
GET    /subscriptions/{id}/runs    — 执行历史
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.core.deps import current_user, require_any_op
from app.users.models import User
from app.warehouse.subscription.models import Subscription
from app.warehouse.service_ref import (
    ServiceSourceRef,
    SOURCE_TABLE,
    assert_not_ods_source,
)

router = APIRouter(prefix="/subscriptions", tags=["subscriptions"])

STATUS_ENABLED = "enabled"
STATUS_PAUSED  = "paused"
STATUS_EXPIRED = "expired"
STATUS_DRAFT   = "draft"


# ════════════════════════════════════════════
# Schemas
# ════════════════════════════════════════════

class SubscriptionIn(BaseModel):
    model_config = {"extra": "forbid"}

    name: str
    description: str | None = None
    source_type: str = "table"
    source_id: str
    source_label: str | None = None
    source_layer: str | None = None
    field_scope: list[dict] = []
    recipients: list[dict] = []
    delivery_target: str = "feishu"
    frequency: str = "manual"
    cron_expr: str | None = None
    push_format: str = "json"
    is_active: bool = True


class SubscriptionUpdateIn(BaseModel):
    model_config = {"extra": "forbid"}

    name: str | None = None
    description: str | None = None
    source_type: str | None = None
    source_id: str | None = None
    source_label: str | None = None
    source_layer: str | None = None
    field_scope: list[dict] | None = None
    recipients: list[dict] | None = None
    delivery_target: str | None = None
    frequency: str | None = None
    cron_expr: str | None = None
    push_format: str | None = None
    is_active: bool | None = None


class SubscriptionOut(BaseModel):
    id: int
    name: str
    description: str | None
    source_type: str
    source_id: str
    source_label: str | None
    source_layer: str | None
    field_scope: list
    recipients: list
    delivery_target: str
    frequency: str
    cron_expr: str | None
    push_format: str
    status: str
    last_sent_at: str | None
    last_status: str
    created_by: int | None
    created_at: str
    updated_at: str


# ════════════════════════════════════════════
# Helpers
# ════════════════════════════════════════════

def _to_out(sub: Subscription) -> SubscriptionOut:
    return SubscriptionOut(
        id=sub.id,
        name=sub.name,
        description=sub.description,
        source_type=sub.source_type,
        source_id=sub.source_id,
        source_label=sub.source_label,
        source_layer=sub.source_layer,
        field_scope=sub.field_scope or [],
        recipients=sub.recipients or [],
        delivery_target=sub.delivery_target,
        frequency=sub.frequency,
        cron_expr=sub.cron_expr,
        push_format=sub.push_format,
        status=sub.status,
        last_sent_at=sub.last_sent_at.isoformat() if sub.last_sent_at else None,
        last_status=sub.last_status,
        created_by=sub.created_by,
        created_at=sub.created_at.isoformat(),
        updated_at=sub.updated_at.isoformat(),
    )


async def _validate_source(ref: ServiceSourceRef, db: AsyncSession) -> None:
    await assert_not_ods_source(ref, db)

    # 接收人权限校验（占位）
    # P1 阶段仅做基本校验，完整权限校验在后续接入具体通知渠道时补充


# ════════════════════════════════════════════
# CRUD
# ════════════════════════════════════════════

@router.get("", response_model=list[SubscriptionOut])
async def list_subscriptions(
    source_type: str | None = Query(None),
    status: str | None = Query(None),
    _: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> list[SubscriptionOut]:
    stmt = select(Subscription).order_by(desc(Subscription.updated_at))
    if source_type:
        stmt = stmt.where(Subscription.source_type == source_type)
    if status:
        stmt = stmt.where(Subscription.status == status)
    rows = (await db.execute(stmt)).scalars().all()
    return [_to_out(r) for r in rows]


@router.post("", response_model=SubscriptionOut, dependencies=[
    Depends(require_any_op(("warehouse.service", "C")))
])
async def create_subscription(
    payload: SubscriptionIn,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> SubscriptionOut:
    ref = ServiceSourceRef(
        source_type=payload.source_type,
        source_id=payload.source_id,
        source_label=payload.source_label,
        source_layer=payload.source_layer,
    )
    await _validate_source(ref, db)

    if not payload.recipients:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail="接收人不能为空。至少配置一个接收对象。",
        )

    sub = Subscription(
        name=payload.name,
        description=payload.description,
        source_type=payload.source_type,
        source_id=payload.source_id,
        source_label=payload.source_label or ref.source_label,
        source_layer=payload.source_layer or ref.source_layer,
        field_scope=payload.field_scope,
        recipients=payload.recipients,
        delivery_target=payload.delivery_target,
        frequency=payload.frequency,
        cron_expr=payload.cron_expr,
        push_format=payload.push_format,
        status=STATUS_ENABLED if payload.is_active else STATUS_DRAFT,
        created_by=user.id,
    )
    db.add(sub)
    await db.commit()
    await db.refresh(sub)
    return _to_out(sub)


@router.get("/{sub_id}", response_model=SubscriptionOut)
async def get_subscription(
    sub_id: int,
    _: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> SubscriptionOut:
    sub = await db.get(Subscription, sub_id)
    if sub is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="订阅不存在")
    return _to_out(sub)


@router.put("/{sub_id}", response_model=SubscriptionOut, dependencies=[
    Depends(require_any_op(("warehouse.service", "U")))
])
async def update_subscription(
    sub_id: int,
    payload: SubscriptionUpdateIn,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> SubscriptionOut:
    sub = await db.get(Subscription, sub_id)
    if sub is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="订阅不存在")

    for field_name in (
        "name", "description", "source_type", "source_id", "source_label",
        "source_layer", "field_scope", "recipients", "delivery_target",
        "frequency", "cron_expr", "push_format", "is_active",
    ):
        val = getattr(payload, field_name, None)
        if val is not None:
            setattr(sub, field_name, val)

    ref = ServiceSourceRef(
        source_type=sub.source_type,
        source_id=sub.source_id,
        source_layer=sub.source_layer,
    )
    await _validate_source(ref, db)
    await db.commit()
    await db.refresh(sub)
    return _to_out(sub)


@router.delete("/{sub_id}", dependencies=[
    Depends(require_any_op(("warehouse.service", "D")))
])
async def delete_subscription(
    sub_id: int,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, bool]:
    sub = await db.get(Subscription, sub_id)
    if sub is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="订阅不存在")
    await db.delete(sub)
    await db.commit()
    return {"ok": True}


@router.post("/{sub_id}/toggle", response_model=SubscriptionOut, dependencies=[
    Depends(require_any_op(("warehouse.service", "U")))
])
async def toggle_subscription(
    sub_id: int,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> SubscriptionOut:
    sub = await db.get(Subscription, sub_id)
    if sub is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="订阅不存在")

    if sub.status == STATUS_ENABLED:
        sub.status = STATUS_PAUSED
    elif sub.status == STATUS_PAUSED:
        ref = ServiceSourceRef(
            source_type=sub.source_type,
            source_id=sub.source_id,
            source_layer=sub.source_layer,
        )
        await _validate_source(ref, db)
        sub.status = STATUS_ENABLED
    else:
        sub.status = STATUS_ENABLED

    await db.commit()
    await db.refresh(sub)
    return _to_out(sub)


# ════════════════════════════════════════════
# 手动触发 / 执行历史
# ════════════════════════════════════════════

@router.post("/{sub_id}/run", dependencies=[
    Depends(require_any_op(("warehouse.service", "C")))
])
async def run_subscription(
    sub_id: int,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict:
    """手动触发一次订阅投递。复用 push_service 取数链路验证数据可读。"""
    from datetime import datetime, UTC

    sub = await db.get(Subscription, sub_id)
    if sub is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="订阅不存在")
    if sub.status not in (STATUS_ENABLED,):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="订阅未启用，无法手动触发")

    # P1: 按 source_type 路由取数，复用 push_service._load_source_rows
    # 后续迭代接入具体投递渠道（飞书消息/邮件/Webhook）
    rows = 0
    message = "success"
    status = "success"
    try:
        st = sub.source_type or "table"
        sid = sub.source_id
        if st == "table" or st == "report":
            from app.push.push_service import _load_source_rows
            data = await _load_source_rows(sid, db, "")
        elif st == "dataset":
            from app.datasets.models import DataSet, DataSetTable
            ds = await db.get(DataSet, int(sid))
            table_name = None
            if ds:
                dt_row = await db.execute(
                    select(DataSetTable.table_name).where(DataSetTable.dataset_id == ds.id).limit(1)
                )
                table_name = dt_row.scalar_one_or_none()
            if table_name:
                from app.push.push_service import _load_source_rows
                data = await _load_source_rows(table_name, db, "")
            else:
                data = []
                status = "failed"
                message = f"数据集 {sid} 无来源表"
        elif st == "ads" or st == "metric":
            from app.push.push_service import _load_source_rows
            data = await _load_source_rows(sid, db, "")
        else:
            data = []
            status = "failed"
            message = f"不支持的来源类型: {st}"
        rows = len(data) if not status.startswith("fail") else 0
        if status == "success" and rows == 0:
            status = "partial"
            message = "数据源返回 0 行"
    except Exception as e:
        status = "failed"
        message = str(e)[:500]

    now = datetime.now(UTC)
    sub.last_sent_at = now
    sub.last_status = status
    await db.commit()

    return {
        "ok": status != "failed",
        "message": message,
        "rows": rows,
        "sent_at": now.isoformat(),
    }


@router.get("/{sub_id}/runs")
async def list_subscription_runs(
    sub_id: int,
    _: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> list[dict]:
    """订阅执行历史。复用 scheduler 的 JobRun 表。"""
    from app.scheduler.models import JobRun

    rows = (
        await db.execute(
            select(JobRun)
            .where(JobRun.kind == "subscription", JobRun.business_id == sub_id)
            .order_by(desc(JobRun.started_at))
            .limit(50)
        )
    ).scalars().all()

    return [
        {
            "id": r.id,
            "status": r.status,
            "rows": r.rows,
            "message": r.message,
            "started_at": r.started_at.isoformat() if r.started_at else None,
            "finished_at": r.finished_at.isoformat() if r.finished_at else None,
            "triggered_by": r.triggered_by,
        }
        for r in rows
    ]
