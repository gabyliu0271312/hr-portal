# -*- coding: utf-8 -*-
"""数据仓库路由

路由前缀: /api/v1/warehouse
"""
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.core.deps import current_user, require_op
from app.users.models import User
from app.warehouse.schemas import (
    WAREHOUSE_LAYERS,
    ASSET_STATUSES,
    WarehouseAssetUpdateIn,
    WarehouseModelCreateIn,
    WarehouseModelUpdateIn,
    DatasetOutputFieldIn,
    WarehouseMetricCreateIn,
    WarehouseMetricUpdateIn,
    WarehouseMetricOut,
    WarehouseMetricDetailOut,
    MetricPaginatedOut,
    ImpactRefOut,
    AssetEndpointsOut,
    SyncHistoryOut,
)
from app.warehouse.service import WarehouseService, get_warehouse_service
from app.warehouse.impact import get_impact_analyzer

router = APIRouter(prefix="/warehouse", tags=["数据仓库"])


# ==================== 辅助 ====================

def _svc(db: AsyncSession) -> WarehouseService:
    return get_warehouse_service(db)


def _validate_warehouse_layer(value: str | None) -> None:
    """校验 warehouse_layer 枚举值"""
    if value is not None and value not in WAREHOUSE_LAYERS:
        raise HTTPException(
            status_code=400,
            detail=f"无效的 warehouse_layer: {value}，允许值: {', '.join(WAREHOUSE_LAYERS)}",
        )


def _validate_asset_status(value: str | None) -> None:
    """校验 asset_status 枚举值"""
    if value is not None and value not in ASSET_STATUSES:
        raise HTTPException(
            status_code=400,
            detail=f"无效的 asset_status: {value}，允许值: {', '.join(ASSET_STATUSES)}",
        )


# ==================== 数据资产 ====================

@router.get(
    "/assets",
    summary="数据资产列表",
    dependencies=[Depends(require_op("warehouse.assets", "V"))],
)
async def list_assets(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=200),
    keyword: str | None = Query(None),
    warehouse_layer: str | None = Query(None),
    subject_area: str | None = Query(None),
    source_system: str | None = Query(None),
    asset_status: str | None = Query(None),
    _: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
):
    """查询数据资产列表，支持分页和多条件筛选。

    权限要求：warehouse.assets:V
    """
    return await _svc(db).list_assets(
        page=page,
        page_size=page_size,
        keyword=keyword,
        warehouse_layer=warehouse_layer,
        subject_area=subject_area,
        source_system=source_system,
        asset_status=asset_status,
    )


@router.get(
    "/assets/{table_name}",
    summary="数据资产详情",
    dependencies=[Depends(require_op("warehouse.assets", "V"))],
)
async def get_asset(
    table_name: str,
    _: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
):
    """获取数据资产详细信息。

    返回基础信息、数仓属性、UCP 关联、运行信息。
    权限要求：warehouse.assets:V
    """
    result = await _svc(db).get_asset(table_name)
    if result is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=f"资产不存在: {table_name}")
    return result


@router.patch(
    "/assets/{table_name}",
    summary="更新数据资产",
    dependencies=[Depends(require_op("warehouse.assets", "U"))],
)
async def update_asset(
    table_name: str,
    payload: WarehouseAssetUpdateIn,
    db: AsyncSession = Depends(get_session),
):
    """更新数据资产的数仓属性。

    校验 warehouse_layer / asset_status 枚举值（非法值返回 400）。
    exclude_unset 模式下可清空 nullable 字段。
    权限要求：warehouse.assets:U
    """
    data = payload.model_dump(exclude_unset=True)

    # 枚举校验
    _validate_warehouse_layer(data.get("warehouse_layer"))
    _validate_asset_status(data.get("asset_status"))

    rt = await _svc(db).update_asset(table_name, data, exclude_unset=True)
    if rt is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=f"资产不存在: {table_name}")
    await db.commit()
    await db.refresh(rt)
    return await _svc(db).get_asset(table_name)


@router.get(
    "/assets/{table_name}/columns",
    summary="资产字段列表",
    dependencies=[Depends(require_op("warehouse.assets", "V"))],
)
async def list_asset_columns(
    table_name: str,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
):
    """获取资产的字段列表。

    自动过滤 is_visible=False 的字段和用户无权查看的隐藏列。
    表不存在时返回 404。
    权限要求：warehouse.assets:V
    """
    columns = await _svc(db).get_asset_columns(table_name, user)
    if columns is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=f"资产不存在: {table_name}")
    return {"table_name": table_name, "columns": columns}


# ==================== 来源与开放 (T0202) ====================

@router.get(
    "/assets/{table_name}/endpoints",
    response_model=AssetEndpointsOut,
    summary="资产级端点聚合（来源与开放）",
    dependencies=[Depends(require_op("warehouse.assets", "V"))],
)
async def get_asset_endpoints(
    table_name: str,
    db: AsyncSession = Depends(get_session),
):
    """获取资产关联的入仓来源、出仓目标、API 暴露和 UCP 资源摘要。

    从不返回 secret 明文。UCP 不可用时对应字段可空。
    """
    from app.datasources.models import DataSource, SyncRun
    from app.push.models import PushTarget
    from app.scheduler.models import JobRun as PushJobRun
    from app.warehouse.schemas import AssetEndpointsOut, ConnectionEndpointSummary

    # DataSource 拉取接口
    ds_q = select(DataSource).where(
        DataSource.table_name == table_name
    ).order_by(DataSource.created_at.desc())
    ds_list = (await db.execute(ds_q)).scalars().all()

    pulls: list[ConnectionEndpointSummary] = []
    for ds in ds_list:
        last_run_q = (
            select(SyncRun)
            .where(SyncRun.datasource_id == ds.id)
            .order_by(SyncRun.started_at.desc())
            .limit(1)
        )
        last_run = (await db.execute(last_run_q)).scalar()
        pulls.append(ConnectionEndpointSummary(
            endpoint_type="pull",
            endpoint_id=ds.id,
            name=ds.table_label or ds.table_name,
            owner="datasource",
            status="active" if ds.is_active else "inactive",
            is_active=ds.is_active,
            schedule=ds.schedule,
            last_run_at=last_run.started_at if last_run else ds.last_sync_at,
            last_status=last_run.status if last_run else ds.last_status,
            last_rows=last_run.rows if last_run else ds.last_rows,
            last_message=last_run.message if last_run else ds.last_message,
            has_secrets=bool(ds.secrets_encrypted),
            config_route="DatasourceEndpoints",
            summary_extra={"source_type": ds.source_type or ""},
        ))

    # PushTarget 推送接口
    pt_q = select(PushTarget).where(
        PushTarget.source_table == table_name
    ).order_by(PushTarget.created_at.desc())
    pt_list = (await db.execute(pt_q)).scalars().all()

    pushes: list[ConnectionEndpointSummary] = []
    exposes: list[ConnectionEndpointSummary] = []
    for pt in pt_list:
        last_run_q = (
            select(PushJobRun)
            .where(PushJobRun.business_id == pt.id, PushJobRun.kind == "push_target")
            .order_by(PushJobRun.started_at.desc())
            .limit(1)
        )
        last_run = (await db.execute(last_run_q)).scalar()

        ep = ConnectionEndpointSummary(
            endpoint_type="push" if pt.push_type != "api_expose" else "expose",
            endpoint_id=pt.id,
            name=pt.name or f"PushTarget #{pt.id}",
            owner="pushtarget",
            status="active" if pt.is_active else "inactive",
            is_active=pt.is_active,
            schedule=pt.settings.get("schedule") if pt.settings else None,
            last_run_at=last_run.started_at if last_run else pt.last_push_at,
            last_status=last_run.status if last_run else pt.last_status,
            last_rows=last_run.rows if last_run else pt.last_rows,
            last_message=last_run.message if last_run else pt.last_message,
            has_secrets=bool(pt.secrets_encrypted),
            config_route="DatasourceEndpoints",
            summary_extra={
                "push_type": pt.push_type or "",
                "mapping_count": len(pt.field_mappings) if pt.field_mappings else 0,
            },
        )
        if pt.push_type == "api_expose":
            exposes.append(ep)
        else:
            pushes.append(ep)

    # UCP 资源（降级：UCP 未合并/不可用时为空）
    ucp_resources: list[ConnectionEndpointSummary] = []
    try:
        from app.warehouse.ucp_adapter import get_asset_ucp_info
        ucp_info = await get_asset_ucp_info(db, table_name)
        if ucp_info and ucp_info.get("ucp_system_id"):
            ucp_resources.append(ConnectionEndpointSummary(
                endpoint_type="ucp_resource",
                endpoint_id=ucp_info.get("ucp_resource_id") or 0,
                name=ucp_info.get("ucp_resource_name") or "UCP 资源",
                owner="ucp",
                status="unknown",
                config_route=ucp_info.get("ucp_jump_url") or None,
                summary_extra={
                    "system_name": ucp_info.get("ucp_system_name", ""),
                    "resource_status": ucp_info.get("ucp_resource_status", ""),
                },
            ))
    except Exception:
        pass  # UCP 不可用时跳过

    return AssetEndpointsOut(
        table_name=table_name,
        pulls=pulls,
        pushes=pushes,
        exposes=exposes,
        ucp_resources=ucp_resources,
    )


# ==================== 同步历史聚合 (T0210) ====================

@router.get(
    "/assets/{table_name}/sync-history",
    response_model=SyncHistoryOut,
    summary="资产同步/推送历史聚合",
    dependencies=[Depends(require_op("warehouse.assets", "V"))],
)
async def get_asset_sync_history(
    table_name: str,
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_session),
):
    """获取资产相关的同步/推送历史，按时间倒序。

    聚合 DataSource SyncRun 和 PushTarget JobRun。
    """
    from datetime import datetime
    from app.datasources.models import DataSource, SyncRun
    from app.push.models import PushTarget
    from app.scheduler.models import JobRun as PushJobRun

    entries: list[dict] = []

    # DataSource 同步历史
    ds_q = select(DataSource).where(DataSource.table_name == table_name)
    ds_list = (await db.execute(ds_q)).scalars().all()
    for ds in ds_list:
        runs_q = (
            select(SyncRun)
            .where(SyncRun.datasource_id == ds.id)
            .order_by(SyncRun.started_at.desc())
            .limit(limit)
        )
        runs = (await db.execute(runs_q)).scalars().all()
        for r in runs:
            entries.append({
                "source_type": "datasource",
                "source_name": ds.table_label or ds.table_name,
                "source_id": ds.id,
                "run_id": r.id,
                "status": r.status,
                "started_at": r.started_at.isoformat() if r.started_at else None,
                "finished_at": r.finished_at.isoformat() if r.finished_at else None,
                "rows": r.rows,
                "message": r.message,
                "triggered_by": r.triggered_by,
            })

    # PushTarget 推送历史
    pt_q = select(PushTarget).where(PushTarget.source_table == table_name)
    pt_list = (await db.execute(pt_q)).scalars().all()
    for pt in pt_list:
        runs_q = (
            select(PushJobRun)
            .where(PushJobRun.business_id == pt.id, PushJobRun.kind == "push_target")
            .order_by(PushJobRun.started_at.desc())
            .limit(limit)
        )
        runs = (await db.execute(runs_q)).scalars().all()
        for r in runs:
            entries.append({
                "source_type": "pushtarget",
                "source_name": pt.name or f"Push #{pt.id}",
                "source_id": pt.id,
                "run_id": r.id,
                "status": r.status,
                "started_at": r.started_at.isoformat() if r.started_at else None,
                "finished_at": r.finished_at.isoformat() if r.finished_at else None,
                "rows": r.rows,
                "message": r.message,
                "triggered_by": r.triggered_by,
            })

    # 按时间倒序
    entries.sort(key=lambda x: x.get("started_at") or "", reverse=True)
    entries = entries[:limit]

    return {"table_name": table_name, "entries": entries}


# ==================== 数据模型 ====================

@router.get(
    "/models",
    summary="数据模型列表",
    dependencies=[Depends(require_op("warehouse.assets", "V"))],
)
async def list_models(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=200),
    status: str | None = Query(None),
    warehouse_layer: str | None = Query(None),
    subject_area: str | None = Query(None),
    keyword: str | None = Query(None),
    _: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
):
    """查询数据模型列表，支持分页和多条件筛选。

    权限要求：warehouse.assets:V
    """
    return await _svc(db).list_models(
        page=page, page_size=page_size,
        status=status, warehouse_layer=warehouse_layer,
        subject_area=subject_area, keyword=keyword,
    )


@router.post(
    "/models",
    summary="创建数据模型",
    dependencies=[Depends(require_op("warehouse.assets", "C"))],
)
async def create_model(
    payload: WarehouseModelCreateIn,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
):
    """创建数据模型（默认 status=draft）。

    Pydantic 校验：name 必填、字段长度、枚举值。
    权限要求：warehouse.assets:C
    """
    try:
        result = await _svc(db).create_model(
            payload.model_dump(), user_id=user.id
        )
        await db.commit()
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get(
    "/models/{model_id}",
    summary="数据模型详情",
    dependencies=[Depends(require_op("warehouse.assets", "V"))],
)
async def get_model(
    model_id: int,
    _: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
):
    """获取数据模型详情（含 tables、relations、output_fields）。

    权限要求：warehouse.assets:V
    """
    result = await _svc(db).get_model(model_id)
    if result is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=f"模型不存在: {model_id}")
    return result


@router.patch(
    "/models/{model_id}",
    summary="更新数据模型",
    dependencies=[Depends(require_op("warehouse.assets", "U"))],
)
async def update_model(
    model_id: int,
    payload: WarehouseModelUpdateIn,
    db: AsyncSession = Depends(get_session),
):
    """更新数据模型元数据。

    Pydantic 校验：字段类型、长度。
    权限要求：warehouse.assets:U
    """
    data = payload.model_dump(exclude_unset=True)
    ds = await _svc(db).update_model(model_id, data)
    if ds is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=f"模型不存在: {model_id}")
    await db.commit()
    await db.refresh(ds)
    return await _svc(db).get_model(model_id)


@router.post(
    "/models/{model_id}/publish",
    summary="发布数据模型",
    dependencies=[Depends(require_op("warehouse.assets", "U"))],
)
async def publish_model(
    model_id: int,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
):
    """发布数据模型。

    校验：至少一张表；多表时至少一条关联。
    权限要求：warehouse.assets:U
    """
    try:
        result = await _svc(db).publish_model(model_id, user.id)
        if result is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail=f"模型不存在: {model_id}")
        await db.commit()
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post(
    "/models/{model_id}/archive",
    summary="归档数据模型",
    dependencies=[Depends(require_op("warehouse.assets", "D"))],
)
async def archive_model(
    model_id: int,
    db: AsyncSession = Depends(get_session),
):
    """归档数据模型。

    权限要求：warehouse.assets:D
    """
    ds = await _svc(db).archive_model(model_id)
    if ds is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=f"模型不存在: {model_id}")
    await db.commit()
    return {"id": ds.id, "status": ds.status}


@router.get(
    "/models/{model_id}/output-fields",
    summary="输出字段列表",
    dependencies=[Depends(require_op("warehouse.assets", "V"))],
)
async def get_output_fields(
    model_id: int,
    _: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
):
    """获取模型输出字段列表（按 display_order 排序）。

    数据集不存在时返回 404。
    权限要求：warehouse.assets:V
    """
    try:
        return await _svc(db).get_output_fields(model_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.put(
    "/models/{model_id}/output-fields",
    summary="保存输出字段",
    dependencies=[Depends(require_op("warehouse.assets", "U"))],
)
async def save_output_fields(
    model_id: int,
    payload: list[DatasetOutputFieldIn],
    db: AsyncSession = Depends(get_session),
):
    """全量保存输出字段（先删后插）。

    Pydantic 校验字段长度、类型、必填项。
    逻辑校验：dataset 存在、source_alias 属于该模型、source_column 存在、output_code 唯一。
    权限要求：warehouse.assets:U
    """
    try:
        fields_data = [f.model_dump() for f in payload]
        result = await _svc(db).save_output_fields(model_id, fields_data)
        await db.commit()
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post(
    "/models/{model_id}/preview",
    summary="模型预览",
    dependencies=[Depends(require_op("warehouse.assets", "V"))],
)
async def preview_model(
    model_id: int,
    payload: dict | None = None,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
):
    """预览模型数据。

    复用 DataSet SQL 构建器（run_dataset_query），支持多表 JOIN、权限过滤。
    limit 默认 20，最大 100。
    权限要求：warehouse.assets:V
    """
    limit = (payload or {}).get("limit", 20)
    return await _svc(db).preview_model(model_id, limit=limit, user=user)


# ==================== 指标管理 ====================

@router.get(
    "/metrics",
    summary="指标列表",
    response_model=MetricPaginatedOut,
    dependencies=[Depends(require_op("warehouse.metrics", "V"))],
)
async def list_metrics(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=200),
    keyword: str | None = Query(None),
    subject_area: str | None = Query(None),
    status: str | None = Query(None),
    _: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
):
    """查询指标列表（分页 + keyword/subject_area/status 筛选）。

    权限要求：warehouse.metrics:V
    """
    return await _svc(db).list_metrics(
        page=page, page_size=page_size,
        keyword=keyword, subject_area=subject_area, status=status,
    )


@router.post(
    "/metrics",
    summary="创建指标",
    response_model=WarehouseMetricDetailOut,
    dependencies=[Depends(require_op("warehouse.metrics", "C"))],
)
async def create_metric(
    payload: WarehouseMetricCreateIn,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
):
    """创建指标（默认 status=draft）。

    Pydantic 校验：metric_type 枚举、字段长度。
    业务校验：metric_code 唯一、related_dataset_id 存在。
    权限要求：warehouse.metrics:C
    """
    try:
        result = await _svc(db).create_metric(
            payload.model_dump(), user_id=user.id
        )
        await db.commit()
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get(
    "/metrics/{metric_id}",
    summary="指标详情",
    response_model=WarehouseMetricDetailOut,
    dependencies=[Depends(require_op("warehouse.metrics", "V"))],
)
async def get_metric(
    metric_id: int,
    _: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
):
    """获取指标详情。

    权限要求：warehouse.metrics:V
    """
    result = await _svc(db).get_metric(metric_id)
    if result is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=f"指标不存在: {metric_id}")
    return result


@router.patch(
    "/metrics/{metric_id}",
    summary="更新指标",
    response_model=WarehouseMetricDetailOut,
    dependencies=[Depends(require_op("warehouse.metrics", "U"))],
)
async def update_metric(
    metric_id: int,
    payload: WarehouseMetricUpdateIn,
    db: AsyncSession = Depends(get_session),
):
    """更新指标元数据（已归档指标不可编辑）。

    Pydantic 校验：metric_type 枚举。
    exclude_unset 模式支持清空 nullable 字段。
    权限要求：warehouse.metrics:U
    """
    try:
        m = await _svc(db).update_metric(
            metric_id, payload.model_dump(exclude_unset=True), exclude_unset=True
        )
        if m is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail=f"指标不存在: {metric_id}")
        await db.commit()
        await db.refresh(m)
        return await _svc(db).get_metric(metric_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post(
    "/metrics/{metric_id}/publish",
    summary="发布指标",
    response_model=WarehouseMetricDetailOut,
    dependencies=[Depends(require_op("warehouse.metrics", "U"))],
)
async def publish_metric(
    metric_id: int,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
):
    """发布指标（仅 draft→published，记录 published_at/published_by）。

    权限要求：warehouse.metrics:U
    """
    try:
        result = await _svc(db).publish_metric(metric_id, user.id)
        if result is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail=f"指标不存在: {metric_id}")
        await db.commit()
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post(
    "/metrics/{metric_id}/archive",
    summary="归档指标",
    response_model=WarehouseMetricDetailOut,
    dependencies=[Depends(require_op("warehouse.metrics", "U"))],
)
async def archive_metric(
    metric_id: int,
    db: AsyncSession = Depends(get_session),
):
    """归档指标（仅 published→archived）。

    权限要求：warehouse.metrics:U
    """
    try:
        result = await _svc(db).archive_metric(metric_id)
        if result is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail=f"指标不存在: {metric_id}")
        await db.commit()
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# ==================== 影响分析 ====================

@router.get(
    "/impact/table/{table_name}",
    summary="表影响分析",
    dependencies=[Depends(require_op("warehouse.assets", "V"))],
)
async def impact_table(
    table_name: str,
    db: AsyncSession = Depends(get_session),
):
    """扫描对该表的引用。

    表不存在时返回 404。
    权限要求：warehouse.assets:V
    """
    from app.data.models import RegisteredTable
    rt = (await db.execute(
        select(RegisteredTable).where(RegisteredTable.table_name == table_name)
    )).scalar_one_or_none()
    if rt is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=f"表不存在: {table_name}")

    analyzer = get_impact_analyzer(db)
    refs = await analyzer.scan_table(table_name)
    return {"table_name": table_name, "references": refs, "blocking": analyzer.has_blocking(refs)}


@router.get(
    "/impact/field",
    summary="字段影响分析",
    dependencies=[Depends(require_op("warehouse.assets", "V"))],
)
async def impact_field(
    table_name: str,
    column_code: str,
    db: AsyncSession = Depends(get_session),
):
    """扫描对该字段的引用。

    表/字段不存在时返回 404。
    字段匹配绑定 alias→table_name，防止跨表同名字段误报。
    权限要求：warehouse.assets:V
    """
    from app.data.models import RegisteredTable, TableColumn
    rt = (await db.execute(
        select(RegisteredTable).where(RegisteredTable.table_name == table_name)
    )).scalar_one_or_none()
    if rt is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=f"表不存在: {table_name}")
    col_exists = (await db.execute(
        select(TableColumn).where(
            TableColumn.table_name == table_name,
            TableColumn.column_code == column_code,
        )
    )).scalar_one_or_none()
    if col_exists is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=f"字段不存在: {table_name}.{column_code}")

    analyzer = get_impact_analyzer(db)
    refs = await analyzer.scan_field(table_name, column_code)
    return {
        "table_name": table_name, "column_code": column_code,
        "references": refs, "blocking": analyzer.has_blocking(refs),
    }


@router.get(
    "/impact/model/{dataset_id}",
    summary="模型影响分析",
    dependencies=[Depends(require_op("warehouse.assets", "V"))],
)
async def impact_model(
    dataset_id: int,
    db: AsyncSession = Depends(get_session),
):
    """扫描模型的下游引用（报表和指标）。

    模型不存在时返回 404。
    权限要求：warehouse.assets:V
    """
    analyzer = get_impact_analyzer(db)
    refs, exists = await analyzer.scan_model(dataset_id)
    if not exists:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=f"数据集不存在: {dataset_id}")
    return {"dataset_id": dataset_id, "references": refs, "blocking": analyzer.has_blocking(refs)}
    analyzer = get_impact_analyzer(db)
    refs = await analyzer.scan_model(dataset_id)
    return {
        "dataset_id": dataset_id,
        "references": refs,
        "blocking": analyzer.has_blocking(refs),
    }
