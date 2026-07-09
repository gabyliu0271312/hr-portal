# -*- coding: utf-8 -*-
"""API 服务 — CRUD + 动态查询执行器

GET    /api-services              — 列表
POST   /api-services              — 创建
GET    /api-services/{id}         — 详情
PUT    /api-services/{id}         — 更新
DELETE /api-services/{id}         — 删除
POST   /api-services/{id}/toggle  — 启用/停用
GET    /api-services/{id}/data    — 动态查询（公开端点，按鉴权策略验证）
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.core.deps import current_user, require_any_op
from app.users.models import User
from app.warehouse.api_service.models import ApiService
from app.warehouse.service_ref import (
    ServiceSourceRef,
    SOURCE_TABLE,
    assert_not_ods_source,
    resolve_source_layer,
)

router = APIRouter(prefix="/api-services", tags=["api-services"])

STATUS_DRAFT    = "draft"
STATUS_ENABLED  = "enabled"
STATUS_DISABLED = "disabled"
STATUS_ERROR    = "error"


# ════════════════════════════════════════════
# Schemas
# ════════════════════════════════════════════

class ApiServiceIn(BaseModel):
    model_config = {"extra": "forbid"}

    name: str
    description: str | None = None
    source_type: str = "table"
    source_id: str
    source_label: str | None = None
    source_layer: str | None = None
    field_whitelist: list[dict] = []
    filter_fields: list[str] = []
    default_sort: str | None = None
    page_size_max: int = 1000
    auth_policy: dict = {}
    rate_limit: int | None = None
    timeout_seconds: int = 30
    is_active: bool = True


class ApiServiceUpdateIn(BaseModel):
    model_config = {"extra": "forbid"}

    name: str | None = None
    description: str | None = None
    source_type: str | None = None
    source_id: str | None = None
    source_label: str | None = None
    source_layer: str | None = None
    field_whitelist: list[dict] | None = None
    filter_fields: list[str] | None = None
    default_sort: str | None = None
    page_size_max: int | None = None
    auth_policy: dict | None = None
    rate_limit: int | None = None
    timeout_seconds: int | None = None
    is_active: bool | None = None


class ApiServiceOut(BaseModel):
    id: int
    name: str
    description: str | None
    source_type: str
    source_id: str
    source_label: str | None
    source_layer: str | None
    field_whitelist: list
    filter_fields: list
    default_sort: str | None
    page_size_max: int
    auth_policy: dict
    rate_limit: int | None
    timeout_seconds: int
    status: str
    is_active: bool
    created_by: int | None
    created_at: str
    updated_at: str


# ════════════════════════════════════════════
# Helpers
# ════════════════════════════════════════════

def _to_out(svc: ApiService) -> ApiServiceOut:
    return ApiServiceOut(
        id=svc.id,
        name=svc.name,
        description=svc.description,
        source_type=svc.source_type,
        source_id=svc.source_id,
        source_label=svc.source_label,
        source_layer=svc.source_layer,
        field_whitelist=svc.field_whitelist or [],
        filter_fields=svc.filter_fields or [],
        default_sort=svc.default_sort,
        page_size_max=svc.page_size_max,
        auth_policy=svc.auth_policy or {},
        rate_limit=svc.rate_limit,
        timeout_seconds=svc.timeout_seconds,
        status=svc.status,
        is_active=svc.is_active,
        created_by=svc.created_by,
        created_at=svc.created_at.isoformat(),
        updated_at=svc.updated_at.isoformat(),
    )


async def _validate_source(ref: ServiceSourceRef, db: AsyncSession) -> None:
    """验证来源资产的合法性。"""
    # ODS 禁止
    await assert_not_ods_source(ref, db)

    # DWD + 含敏感字段 + field_whitelist 为空 → 拒绝
    layer = ref.source_layer
    if layer is None and ref.source_type == SOURCE_TABLE:
        layer = await resolve_source_layer(ref, db)

    if layer and str(layer).upper() in ("DWD",):
        from app.warehouse.models import RegisteredTable, FieldAsset

        table = await db.execute(
            select(RegisteredTable).where(
                RegisteredTable.table_name == ref.source_id
            )
        )
        table = table.scalar_one_or_none()
        if table:
            field_rows = await db.execute(
                select(FieldAsset.field_name, FieldAsset.is_sensitive, FieldAsset.sensitive_type)
                .where(FieldAsset.table_name == ref.source_id)
            )
            sensitive_fields = [
                {"field": r.field_name, "sensitive_type": r.sensitive_type}
                for r in field_rows
                if r.is_sensitive
            ]
            if sensitive_fields:
                raise HTTPException(
                    status.HTTP_400_BAD_REQUEST,
                    detail={
                        "error": "sensitive_fields_exist",
                        "message": "DWD 层来源含脱敏字段，创建 API 前须在字段白名单中排除或标记脱敏",
                        "sensitive_fields": [f["field"] for f in sensitive_fields],
                    },
                )


# ════════════════════════════════════════════
# CRUD
# ════════════════════════════════════════════

@router.get("", response_model=list[ApiServiceOut])
async def list_api_services(
    source_type: str | None = Query(None),
    status: str | None = Query(None),
    _: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> list[ApiServiceOut]:
    stmt = select(ApiService).order_by(desc(ApiService.updated_at))
    if source_type:
        stmt = stmt.where(ApiService.source_type == source_type)
    if status:
        stmt = stmt.where(ApiService.status == status)
    rows = (await db.execute(stmt)).scalars().all()
    return [_to_out(r) for r in rows]


@router.post("", response_model=ApiServiceOut, dependencies=[
    Depends(require_any_op(("warehouse.service", "C")))
])
async def create_api_service(
    payload: ApiServiceIn,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> ApiServiceOut:
    ref = ServiceSourceRef(
        source_type=payload.source_type,
        source_id=payload.source_id,
        source_label=payload.source_label,
        source_layer=payload.source_layer,
    )

    # 校验字段白名单
    if not payload.field_whitelist:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail="字段白名单不能为空。至少选择一个返回字段。",
        )

    # 校验来源合法性
    await _validate_source(ref, db)

    svc = ApiService(
        name=payload.name,
        description=payload.description,
        source_type=payload.source_type,
        source_id=payload.source_id,
        source_label=payload.source_label or ref.source_label,
        source_layer=payload.source_layer or ref.source_layer,
        field_whitelist=payload.field_whitelist,
        filter_fields=payload.filter_fields,
        default_sort=payload.default_sort,
        page_size_max=payload.page_size_max,
        auth_policy=payload.auth_policy,
        rate_limit=payload.rate_limit,
        timeout_seconds=payload.timeout_seconds,
        status=STATUS_ENABLED if payload.is_active else STATUS_DRAFT,
        is_active=payload.is_active,
        created_by=user.id,
    )
    db.add(svc)
    await db.commit()
    await db.refresh(svc)
    return _to_out(svc)


@router.get("/{svc_id}", response_model=ApiServiceOut)
async def get_api_service(
    svc_id: int,
    _: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> ApiServiceOut:
    svc = await db.get(ApiService, svc_id)
    if svc is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="API 服务不存在")
    return _to_out(svc)


@router.put("/{svc_id}", response_model=ApiServiceOut, dependencies=[
    Depends(require_any_op(("warehouse.service", "U")))
])
async def update_api_service(
    svc_id: int,
    payload: ApiServiceUpdateIn,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> ApiServiceOut:
    svc = await db.get(ApiService, svc_id)
    if svc is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="API 服务不存在")

    for field_name in (
        "name", "description", "source_type", "source_id", "source_label",
        "source_layer", "field_whitelist", "filter_fields", "default_sort",
        "page_size_max", "auth_policy", "rate_limit", "timeout_seconds",
        "is_active",
    ):
        val = getattr(payload, field_name, None)
        if val is not None:
            setattr(svc, field_name, val)

    # 重新校验来源
    ref = ServiceSourceRef(
        source_type=svc.source_type,
        source_id=svc.source_id,
        source_label=svc.source_label,
        source_layer=svc.source_layer,
    )
    await _validate_source(ref, db)

    await db.commit()
    await db.refresh(svc)
    return _to_out(svc)


@router.delete("/{svc_id}", dependencies=[
    Depends(require_any_op(("warehouse.service", "D")))
])
async def delete_api_service(
    svc_id: int,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, bool]:
    svc = await db.get(ApiService, svc_id)
    if svc is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="API 服务不存在")
    await db.delete(svc)
    await db.commit()
    return {"ok": True}


@router.post("/{svc_id}/toggle", response_model=ApiServiceOut, dependencies=[
    Depends(require_any_op(("warehouse.service", "U")))
])
async def toggle_api_service(
    svc_id: int,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> ApiServiceOut:
    svc = await db.get(ApiService, svc_id)
    if svc is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="API 服务不存在")

    if svc.status == STATUS_ENABLED:
        svc.status = STATUS_DISABLED
    else:
        # 启前校验来源
        ref = ServiceSourceRef(
            source_type=svc.source_type,
            source_id=svc.source_id,
            source_label=svc.source_label,
            source_layer=svc.source_layer,
        )
        await _validate_source(ref, db)
        svc.status = STATUS_ENABLED

    svc.is_active = svc.status == STATUS_ENABLED
    await db.commit()
    await db.refresh(svc)
    return _to_out(svc)


# ════════════════════════════════════════════
# 动态查询端点（公开）
# ════════════════════════════════════════════

@router.get("/{svc_id}/data")
async def query_api_service_data(
    svc_id: int,
    request: Request,
    db: AsyncSession = Depends(get_session),
    page: int = Query(1, ge=1),
    page_size: int = Query(100, ge=1, le=5000),
) -> dict:
    """动态查询 API。根据配置的字段白名单和过滤条件返回数据。"""
    import time as _time
    _t0 = _time.time()
    from app.warehouse.service_ref import resolve_source_layer

    svc = await db.get(ApiService, svc_id)
    if svc is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="API 服务不存在")
    if svc.status != STATUS_ENABLED:
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="API 服务未启用")

    # 鉴权
    auth = svc.auth_policy or {}
    auth_type = auth.get("type", "login")
    if auth_type == "token":
        token = request.headers.get("X-Api-Token", "")
        expected = (svc.auth_policy or {}).get("token", "")
        if not token or token != expected:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Token 无效")
    elif auth_type in ("login", "internal"):
        from app.core.deps import current_user_optional
        # login: 需要登录态；internal: 服务间调用
        pass  # 当前占位，后续接入具体鉴权

    # 解析来源
    ref = ServiceSourceRef(
        source_type=svc.source_type,
        source_id=svc.source_id,
        source_layer=svc.source_layer,
    )
    if ref.source_layer is None:
        await resolve_source_layer(ref, db)

    # 构建 SQL 查询
    table_name = ref.source_id if ref.source_type == SOURCE_TABLE else None
    if not table_name:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=f"暂不支持来源类型: {ref.source_type}")

    # 字段白名单
    whitelist = svc.field_whitelist or []
    if not whitelist:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, detail="字段白名单为空")

    field_names = [f["field"] for f in whitelist if f.get("field")]
    aliases = {f["field"]: f.get("alias", f["field"]) for f in whitelist}

    from sqlalchemy import text as sa_text

    # 安全：用 validate_identifier 校验所有标识符
    from app.warehouse.service import validate_identifier
    safe_table = validate_identifier(table_name)
    safe_fields = ", ".join(validate_identifier(fn) for fn in field_names)

    # 构建 WHERE 子句（从查询参数提取过滤条件）
    where_clauses = []
    params = {}
    filter_fields = svc.filter_fields or []
    for key, values in request.query_params.multi_items():
        if key in ("page", "page_size"):
            continue
        if key in filter_fields:
            safe_key = validate_identifier(key)
            where_clauses.append(f"{safe_key} = :filter_{key}")
            params[f"filter_{key}"] = values

    where_sql = ""
    if where_clauses:
        where_sql = "WHERE " + " AND ".join(where_clauses)

    # 排序
    order_sql = ""
    if svc.default_sort:
        safe_sort = validate_identifier(svc.default_sort)
        order_sql = f"ORDER BY {safe_sort}"

    # 分页
    limit = min(page_size, svc.page_size_max)
    offset = (page - 1) * limit

    sql = f"SELECT {safe_fields} FROM {safe_table} {where_sql} {order_sql} LIMIT :_limit OFFSET :_offset"
    params["_limit"] = limit
    params["_offset"] = offset

    # 总数查询
    count_sql = f"SELECT COUNT(*) FROM {safe_table} {where_sql}"
    total = (await db.execute(sa_text(count_sql), params)).scalar_one()

    # 数据查询
    rows = (await db.execute(sa_text(sql), params)).mappings().all()

    # 应用别名
    items = []
    for row in rows:
        item = {}
        for fn in field_names:
            alias = aliases.get(fn, fn)
            item[alias] = row.get(fn)
        items.append(item)

    # 写入服务监控日志
    from app.warehouse.service_monitor.router import write_service_log
    await write_service_log(
        db,
        service_type="api",
        service_id=svc.id,
        service_name=svc.name,
        source_type=svc.source_type,
        source_id=svc.source_id,
        status="success",
        rows=len(items),
        duration_ms=int((_time.time() - _t0) * 1000),
        caller_ip=request.client.host if request.client else None,
    )

    return {
        "total": total,
        "page": page,
        "page_size": limit,
        "items": items,
    }
