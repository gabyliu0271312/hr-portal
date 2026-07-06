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
    WarehouseFeatureFlagsOut,
    WarehouseAssetBatchLayerIn,
    WarehouseAssetBatchLayerOut,
    WarehouseLayerStatsOut,
    LineageGraphOut,
    QUALITY_RULE_TYPES,
    QUALITY_SEVERITIES,
    WarehouseQualityRuleIn,
    WarehouseQualityRuleUpdateIn,
    WarehouseQualityRuleOut,
    WarehouseQualityRunOut,
    QualityRunTriggerOut,
    QualityAlertSummaryOut,
    UcpSystemOut,
    UcpResourceOut,
    UcpResourceStatusOut,
    UcpResourcePreviewOut,
    ModelVersionOut,
    ModelVersionRollbackIn,
    ModelPreviewV2Out,
    WarehouseRunSummaryOut,
    WarehouseAlertRuleIn,
    WarehouseAlertRuleOut,
)
from app.warehouse.service import WarehouseService, get_warehouse_service
from app.warehouse.impact import get_impact_analyzer
from app.warehouse.lineage import (
    get_lineage_builder,
    DEFAULT_DEPTH,
    MAX_DEPTH,
    DEFAULT_LIMIT,
    MAX_LIMIT,
)
from app.warehouse.models import WarehouseQualityRule, WarehouseQualityRun, WarehouseAlertRule, WarehouseModelVersion
from app.warehouse.quality_engine import execute_quality_rule, _safe_ident

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


# ==================== 二期 Feature Flag (Q0002) ====================

@router.get(
    "/features",
    summary="二期灰度开关",
    response_model=WarehouseFeatureFlagsOut,
    dependencies=[Depends(require_op("warehouse.assets", "V"))],
)
async def get_features():
    """返回二期功能开关和 UCP 可用性，供前端统一读取。

    权限要求：warehouse.assets:V
    """
    from app.core.config import settings
    from app.warehouse.ucp_adapter import is_ucp_available

    return WarehouseFeatureFlagsOut(
        ucp_available=is_ucp_available(),
        phase2_enabled=settings.WAREHOUSE_PHASE2_ENABLED,
        quality_rules=settings.WAREHOUSE_FEATURE_QUALITY_RULES,
        lineage=settings.WAREHOUSE_FEATURE_LINEAGE,
        ucp_proxy=settings.WAREHOUSE_FEATURE_UCP_PROXY,
        modeling_v2=settings.WAREHOUSE_FEATURE_MODELING_V2,
        monitoring=settings.WAREHOUSE_FEATURE_MONITORING,
        layer_enhancement=settings.WAREHOUSE_FEATURE_LAYER_ENHANCEMENT,
    )


# ==================== 数据资产 ====================

@router.get(
    "/assets/layer-stats",
    summary="分层概览统计",
    response_model=WarehouseLayerStatsOut,
    dependencies=[Depends(require_op("warehouse.assets", "V"))],
)
async def get_layer_stats(db: AsyncSession = Depends(get_session)):
    """按分层统计资产数量，返回 7 层各自的资产数。

    权限要求：warehouse.assets:V
    """
    return await _svc(db).get_layer_stats()


@router.patch(
    "/assets/batch-layer",
    summary="批量修改资产分层",
    response_model=WarehouseAssetBatchLayerOut,
    dependencies=[Depends(require_op("warehouse.assets", "U"))],
)
async def batch_update_asset_layer(
    payload: WarehouseAssetBatchLayerIn,
    db: AsyncSession = Depends(get_session),
):
    """批量修改资产分层。

    校验：空列表 400、非法层级 400。
    部分表不存在时返回 200 + 成功/失败明细。
    权限要求：warehouse.assets:U
    """
    _validate_warehouse_layer(payload.warehouse_layer)
    result = await _svc(db).batch_update_asset_layer(
        table_names=payload.table_names,
        warehouse_layer=payload.warehouse_layer,
    )
    await db.commit()
    return result


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
    _validate_warehouse_layer(warehouse_layer)
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


# ==================== 数据血缘 (Q02) ====================

@router.get(
    "/lineage/table/{table_name}",
    summary="表级血缘图",
    response_model=LineageGraphOut,
    dependencies=[Depends(require_op("warehouse.governance", "V"))],
)
async def lineage_table(
    table_name: str,
    depth: int = Query(DEFAULT_DEPTH, ge=1, le=MAX_DEPTH),
    limit: int = Query(DEFAULT_LIMIT, ge=1, le=MAX_LIMIT),
    db: AsyncSession = Depends(get_session),
):
    """获取表的上游来源和下游消费血缘图。

    上游：DataSource 同步、UCP 资源。
    下游：DataSet（使用该表）、Metric（依赖该表）、Report（消费该表）。
    数据来源复用 impact.py 的引用扫描，不重写查询逻辑。

    depth 默认 3，最大 5；limit 默认 50，最大 200。
    超限返回 truncated=true + truncation_message。
    权限要求：warehouse.governance:V
    """
    builder = get_lineage_builder(db)
    result = await builder.build_table_lineage(table_name, depth=depth, limit=limit)
    if result is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=f"表不存在: {table_name}")
    return result


@router.get(
    "/lineage/field",
    summary="字段级血缘图",
    response_model=LineageGraphOut,
    dependencies=[Depends(require_op("warehouse.governance", "V"))],
)
async def lineage_field(
    table_name: str = Query(...),
    column_code: str = Query(...),
    depth: int = Query(DEFAULT_DEPTH, ge=1, le=MAX_DEPTH),
    limit: int = Query(DEFAULT_LIMIT, ge=1, le=MAX_LIMIT),
    db: AsyncSession = Depends(get_session),
):
    """获取字段的上下游血缘图。

    复用 impact.py 的 scan_field 解析逻辑：
    DatasetOutputField.source_alias/source_column、
    DatasetCalculatedField.depends_on、Report config、
    WarehouseMetric.related_fields 等。
    字段匹配绑定 alias→table_name，防止跨表同名字段误报。

    depth 默认 3，最大 5；limit 默认 50，最大 200。
    超限返回 truncated=true + truncation_message。
    权限要求：warehouse.governance:V
    """
    builder = get_lineage_builder(db)
    result = await builder.build_field_lineage(table_name, column_code, depth=depth, limit=limit)
    if result is None:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND,
            detail=f"表或字段不存在: {table_name}.{column_code}",
        )
    return result


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


# ==================== 数据质量 (Q03) ====================

def _validate_rule_type(value: str) -> None:
    if value not in QUALITY_RULE_TYPES:
        raise HTTPException(400, detail=f"无效的 rule_type: {value}，允许值: {', '.join(QUALITY_RULE_TYPES)}")


def _validate_severity(value: str) -> None:
    if value not in QUALITY_SEVERITIES:
        raise HTTPException(400, detail=f"无效的 severity: {value}，允许值: {', '.join(QUALITY_SEVERITIES)}")

VALID_ALERT_TYPES = {"quality_fail", "sync_fail", "build_fail", "metric_fail"}
VALID_ALERT_SEVERITIES = {"info", "warn", "error"}

def _validate_alert_type(value: str) -> None:
    if value not in VALID_ALERT_TYPES:
        raise HTTPException(400, detail=f"无效的 alert_type: {value}，允许值: {', '.join(sorted(VALID_ALERT_TYPES))}")

def _validate_alert_severity(value: str) -> None:
    if value not in VALID_ALERT_SEVERITIES:
        raise HTTPException(400, detail=f"无效的 alert severity: {value}，允许值: {', '.join(sorted(VALID_ALERT_SEVERITIES))}")


# --- Q0304: 质量规则列表 ---

@router.get(
    "/quality-rules",
    summary="质量规则列表",
    dependencies=[Depends(require_op("warehouse.governance", "V"))],
)
async def list_quality_rules(
    asset_type: str | None = Query(None),
    asset_code: str | None = Query(None),
    rule_type: str | None = Query(None),
    enabled: bool | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=200),
    db: AsyncSession = Depends(get_session),
):
    """查询质量规则列表，支持按资产类型/编码/规则类型/启用状态筛选。

    权限要求：warehouse.governance:V
    """
    q = select(WarehouseQualityRule)
    if asset_type:
        q = q.where(WarehouseQualityRule.asset_type == asset_type)
    if asset_code:
        q = q.where(WarehouseQualityRule.asset_code == asset_code)
    if rule_type:
        q = q.where(WarehouseQualityRule.rule_type == rule_type)
    if enabled is not None:
        q = q.where(WarehouseQualityRule.enabled == enabled)
    q = q.order_by(WarehouseQualityRule.created_at.desc())

    total_q = select(WarehouseQualityRule)
    # apply same filters for count
    if asset_type:
        total_q = total_q.where(WarehouseQualityRule.asset_type == asset_type)
    if asset_code:
        total_q = total_q.where(WarehouseQualityRule.asset_code == asset_code)
    if rule_type:
        total_q = total_q.where(WarehouseQualityRule.rule_type == rule_type)
    if enabled is not None:
        total_q = total_q.where(WarehouseQualityRule.enabled == enabled)

    total = (await db.execute(total_q)).scalars().all()
    rows = (await db.execute(q.offset((page - 1) * page_size).limit(page_size))).scalars().all()
    return {"total": len(total), "page": page, "page_size": page_size, "items": rows}


# --- Q0304: 质量规则详情 ---

@router.get(
    "/quality-rules/{rule_id}",
    summary="质量规则详情",
    response_model=WarehouseQualityRuleOut,
    dependencies=[Depends(require_op("warehouse.governance", "V"))],
)
async def get_quality_rule(rule_id: int, db: AsyncSession = Depends(get_session)):
    rule = await db.get(WarehouseQualityRule, rule_id)
    if rule is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=f"质量规则不存在: {rule_id}")
    return rule


# --- Q0305: 创建质量规则 ---

@router.post(
    "/quality-rules",
    summary="创建质量规则",
    response_model=WarehouseQualityRuleOut,
    status_code=201,
    dependencies=[Depends(require_op("warehouse.governance", "C"))],
)
async def create_quality_rule(
    payload: WarehouseQualityRuleIn,
    db: AsyncSession = Depends(get_session),
):
    _validate_rule_type(payload.rule_type)
    _validate_severity(payload.severity)
    rule = WarehouseQualityRule(**payload.model_dump())
    db.add(rule)
    await db.commit()
    await db.refresh(rule)
    return rule


# --- Q0305: 更新质量规则 ---

@router.patch(
    "/quality-rules/{rule_id}",
    summary="更新质量规则",
    response_model=WarehouseQualityRuleOut,
    dependencies=[Depends(require_op("warehouse.governance", "U"))],
)
async def update_quality_rule(
    rule_id: int,
    payload: WarehouseQualityRuleUpdateIn,
    db: AsyncSession = Depends(get_session),
):
    rule = await db.get(WarehouseQualityRule, rule_id)
    if rule is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=f"质量规则不存在: {rule_id}")
    data = payload.model_dump(exclude_unset=True)
    if "severity" in data:
        _validate_severity(data["severity"])
    for k, v in data.items():
        setattr(rule, k, v)
    await db.commit()
    await db.refresh(rule)
    return rule


# --- Q0306: 启用/禁用 ---

@router.post(
    "/quality-rules/{rule_id}/enable",
    summary="启用质量规则",
    response_model=WarehouseQualityRuleOut,
    dependencies=[Depends(require_op("warehouse.governance", "U"))],
)
async def enable_quality_rule(rule_id: int, db: AsyncSession = Depends(get_session)):
    rule = await db.get(WarehouseQualityRule, rule_id)
    if rule is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=f"质量规则不存在: {rule_id}")
    rule.enabled = True
    await db.commit()
    await db.refresh(rule)
    return rule


@router.post(
    "/quality-rules/{rule_id}/disable",
    summary="禁用质量规则",
    response_model=WarehouseQualityRuleOut,
    dependencies=[Depends(require_op("warehouse.governance", "U"))],
)
async def disable_quality_rule(rule_id: int, db: AsyncSession = Depends(get_session)):
    rule = await db.get(WarehouseQualityRule, rule_id)
    if rule is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=f"质量规则不存在: {rule_id}")
    rule.enabled = False
    await db.commit()
    await db.refresh(rule)
    return rule


# --- Q0306: 删除 ---

@router.delete(
    "/quality-rules/{rule_id}",
    summary="删除质量规则",
    status_code=204,
    dependencies=[Depends(require_op("warehouse.governance", "D"))],
)
async def delete_quality_rule(rule_id: int, db: AsyncSession = Depends(get_session)):
    """删除质量规则。关联的 quality_runs 保留历史记录（ON DELETE SET NULL）。"""
    rule = await db.get(WarehouseQualityRule, rule_id)
    if rule is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=f"质量规则不存在: {rule_id}")
    await db.delete(rule)
    await db.commit()
    return None


# --- Q0307-Q0309: 手动执行规则 ---

@router.post(
    "/quality-rules/{rule_id}/run",
    summary="手动执行质量规则",
    response_model=QualityRunTriggerOut,
    dependencies=[Depends(require_op("warehouse.governance", "U"))],
)
async def run_quality_rule(rule_id: int, db: AsyncSession = Depends(get_session), user: User = Depends(current_user)):
    """手动触发单条质量规则执行，同步返回结果。

    Q0309: referential_integrity/custom_sql 规则执行时返回"暂不支持"。
    权限要求：warehouse.governance:U
    """
    rule = await db.get(WarehouseQualityRule, rule_id)
    if rule is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=f"质量规则不存在: {rule_id}")

    from datetime import datetime as dt
    started = dt.utcnow()
    result = await execute_quality_rule(
        db, rule.id, rule.asset_type, rule.asset_code,
        rule.rule_type, rule.rule_config or {},
        user=user,
    )
    finished = dt.utcnow()

    # 持久化运行记录
    run = WarehouseQualityRun(
        rule_id=rule.id,
        status=result["status"],
        checked_count=result["checked_count"],
        failed_count=result["failed_count"],
        sample_rows=result.get("sample_rows"),
        message=result.get("message"),
        started_at=started,
        finished_at=finished,
    )
    db.add(run)

    # 回写规则最近运行状态
    rule.last_run_status = result["status"]
    rule.last_run_at = finished

    await db.commit()
    await db.refresh(run)

    return QualityRunTriggerOut(
        run_id=run.id,
        status=result["status"],
        message=result.get("message", ""),
    )


# --- Q0310: 质量运行历史 ---

@router.get(
    "/quality-runs",
    summary="质量运行历史",
    dependencies=[Depends(require_op("warehouse.governance", "V"))],
)
async def list_quality_runs(
    rule_id: int | None = Query(None),
    asset_code: str | None = Query(None),
    status: str | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=200),
    db: AsyncSession = Depends(get_session),
):
    """查询质量运行历史，支持按规则、资产、状态筛选。

    权限要求：warehouse.governance:V
    """
    q = select(WarehouseQualityRun)
    if rule_id is not None:
        q = q.where(WarehouseQualityRun.rule_id == rule_id)
    if status:
        q = q.where(WarehouseQualityRun.status == status)
    if asset_code:
        q = q.join(WarehouseQualityRule, WarehouseQualityRun.rule_id == WarehouseQualityRule.id)\
            .where(WarehouseQualityRule.asset_code == asset_code)
    q = q.order_by(WarehouseQualityRun.started_at.desc())

    # count
    count_q = select(WarehouseQualityRun)
    if rule_id is not None:
        count_q = count_q.where(WarehouseQualityRun.rule_id == rule_id)
    if status:
        count_q = count_q.where(WarehouseQualityRun.status == status)
    total = len((await db.execute(count_q)).scalars().all())

    rows = (await db.execute(q.offset((page - 1) * page_size).limit(page_size))).scalars().all()
    return {"total": total, "page": page, "page_size": page_size, "items": rows}


@router.get(
    "/quality-runs/{run_id}",
    summary="质量运行详情",
    response_model=WarehouseQualityRunOut,
    dependencies=[Depends(require_op("warehouse.governance", "V"))],
)
async def get_quality_run(run_id: int, db: AsyncSession = Depends(get_session)):
    run = await db.get(WarehouseQualityRun, run_id)
    if run is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=f"运行记录不存在: {run_id}")
    return run


# --- Q0313: 质量告警摘要 ---

@router.get(
    "/quality-alerts",
    summary="质量告警摘要",
    response_model=QualityAlertSummaryOut,
    dependencies=[Depends(require_op("warehouse.governance", "V"))],
)
async def get_quality_alerts(db: AsyncSession = Depends(get_session)):
    """返回质量告警摘要：规则总数、失败/警告数、按 severity 分组统计。

    权限要求：warehouse.governance:V
    """
    from sqlalchemy import func, case

    rules = (await db.execute(select(WarehouseQualityRule))).scalars().all()
    total = len(rules)
    failed = sum(1 for r in rules if r.last_run_status in ("fail", "error"))
    warning = sum(1 for r in rules if r.last_run_status == "warn")

    by_sev = {"error": 0, "warn": 0, "info": 0}
    for r in rules:
        if r.last_run_status and r.last_run_status in ("fail", "error"):
            by_sev[r.severity or "warn"] = by_sev.get(r.severity or "warn", 0) + 1

    return QualityAlertSummaryOut(
        total_rules=total,
        failed_rules=failed,
        warning_rules=warning,
        by_severity=by_sev,
    )


# ==================== UCP 薄代理 (Q04) ====================

# Q0402: UCP 系统列表

@router.get(
    "/ucp/systems",
    summary="UCP 系统列表",
    response_model=list[UcpSystemOut],
    dependencies=[Depends(require_op("warehouse.assets", "V"))],
)
async def list_ucp_systems():
    """获取 UCP 系统列表（只读摘要）。

    UCP 不可用时返回空列表。
    权限要求：warehouse.assets:V
    """
    from app.warehouse.ucp_adapter import list_systems as _list_systems
    return await _list_systems()


# Q0404: UCP 资源列表

@router.get(
    "/ucp/resources",
    summary="UCP 资源列表",
    response_model=list[UcpResourceOut],
    dependencies=[Depends(require_op("warehouse.assets", "V"))],
)
async def list_ucp_resources(
    system_id: int | None = Query(None),
):
    """获取 UCP 资源列表（只读摘要），可按系统筛选。

    UCP 不可用时返回空列表。
    权限要求：warehouse.assets:V
    """
    from app.warehouse.ucp_adapter import list_resources as _list_resources
    return await _list_resources(system_id=system_id)


# Q0405: UCP 资源状态

@router.get(
    "/ucp/resources/{resource_id}/status",
    summary="UCP 资源状态",
    response_model=UcpResourceStatusOut,
    dependencies=[Depends(require_op("warehouse.assets", "V"))],
)
async def get_ucp_resource_status(resource_id: int):
    """获取 UCP 资源状态摘要。

    UCP 不可用时返回降级状态。
    权限要求：warehouse.assets:V
    """
    from app.warehouse.ucp_adapter import get_resource_status as _get_status
    result = await _get_status(resource_id)
    if result is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=f"UCP 资源不存在: {resource_id}")
    return result


# Q0406: UCP 资源预览

@router.get(
    "/ucp/resources/{resource_id}/preview",
    summary="UCP 资源预览",
    response_model=UcpResourcePreviewOut,
    dependencies=[Depends(require_op("warehouse.assets", "V"))],
)
async def preview_ucp_resource(
    resource_id: int,
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
):
    """获取 UCP 资源预览数据，敏感字段自动脱敏。

    UCP 不可用时返回降级空数据。
    权限要求：warehouse.assets:V
    """
    from app.warehouse.ucp_adapter import preview_resource as _preview
    from app.permissions.masker import get_hidden_columns

    result = await _preview(resource_id, limit=limit)
    if result is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=f"UCP 资源不存在: {resource_id}")
    return result


# ==================== 建模 V2 (Q05) ====================

# Q0507: 模型发布（增强：记录 diff_snapshot）

@router.post(
    "/models/{model_id}/publish-v2",
    summary="V2 发布模型（含差异快照）",
    dependencies=[Depends(require_op("warehouse.modeling", "U"))],
)
async def publish_model_v2(
    model_id: int,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
):
    """发布模型并记录版本历史快照。

    每次发布生成一条 warehouse_model_versions 记录，
    同时更新 datasets 的 version/diff_snapshot/published_at/published_by。
    权限要求：warehouse.modeling:U
    """
    from app.datasets.models import DataSet, DataSetTable, DataSetRelation
    ds = await db.get(DataSet, model_id)
    if ds is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=f"模型不存在: {model_id}")

    from datetime import datetime as dt
    now = dt.utcnow()
    new_version = (ds.version or 0) + 1

    # 构建完整快照
    tables_q = select(DataSetTable).where(DataSetTable.dataset_id == model_id)
    relations_q = select(DataSetRelation).where(DataSetRelation.dataset_id == model_id)
    tables_rows = (await db.execute(tables_q)).scalars().all()
    relations_rows = (await db.execute(relations_q)).scalars().all()

    # output_fields 表可能不在 datasets 模块（shard），用 raw SQL 兜底
    from sqlalchemy import text as sa_text
    fields_rows = []
    try:
        fields_rows_result = await db.execute(
            sa_text("SELECT * FROM dataset_output_fields WHERE dataset_id = :did ORDER BY id"),
            {"did": model_id},
        )
        fields_rows = fields_rows_result.fetchall()
    except Exception:
        pass

    snapshot = {
        "model": {
            "name": ds.name,
            "description": ds.description,
            "warehouse_layer": ds.warehouse_layer,
            "subject_area": ds.subject_area,
            "owner_name": ds.owner_name,
        },
        "tables": [{"table_name": t.table_name, "alias": t.alias} for t in tables_rows],
        "relations": [
            {
                "left_alias": r.left_alias,
                "right_alias": r.right_alias,
                "join_type": r.join_type,
                "cardinality": r.cardinality,
                "keys": r.keys,
            }
            for r in relations_rows
        ],
        "output_fields": [
            {c: getattr(r, c, None) for c in r._mapping.keys()}
            for r in fields_rows
        ],
    }

    diff = {
        "published_by": user.id,
        "published_at": now.isoformat(),
        "version": new_version,
    }

    # 写入版本历史
    ver = WarehouseModelVersion(
        model_id=model_id,
        version=new_version,
        status="published",
        snapshot=snapshot,
        diff_snapshot=diff,
        published_by=user.id,
        published_at=now,
    )
    db.add(ver)

    # 更新主表
    ds.status = "published"
    ds.published_at = now
    ds.published_by = user.id
    ds.version = new_version
    ds.diff_snapshot = diff

    await db.commit()
    return {"id": ds.id, "status": ds.status, "version": ds.version, "diff_snapshot": ds.diff_snapshot}


# Q0507: 版本历史

@router.get(
    "/models/{model_id}/versions",
    summary="模型版本历史",
    response_model=list[ModelVersionOut],
    dependencies=[Depends(require_op("warehouse.modeling", "V"))],
)
async def list_model_versions(model_id: int, db: AsyncSession = Depends(get_session)):
    """获取模型版本历史列表（按版本号降序）。

    权限要求：warehouse.modeling:V
    """
    from app.datasets.models import DataSet
    ds = await db.get(DataSet, model_id)
    if ds is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=f"模型不存在: {model_id}")

    q = (
        select(WarehouseModelVersion)
        .where(WarehouseModelVersion.model_id == model_id)
        .order_by(WarehouseModelVersion.version.desc())
    )
    rows = (await db.execute(q)).scalars().all()

    if not rows:
        # 无版本历史：从 DataSet 当前状态构造 v1
        return [ModelVersionOut(
            version=ds.version or 1,
            status=ds.status or "published",
            published_at=ds.published_at,
            published_by=ds.published_by,
            diff_snapshot=ds.diff_snapshot,
        )]

    return [ModelVersionOut(
        version=r.version,
        status=r.status,
        published_at=r.published_at,
        published_by=r.published_by,
        diff_snapshot=r.diff_snapshot,
    ) for r in rows]


# Q0507: 版本回滚

@router.post(
    "/models/{model_id}/rollback",
    summary="回滚模型版本",
    dependencies=[Depends(require_op("warehouse.modeling", "U"))],
)
async def rollback_model(
    model_id: int,
    payload: ModelVersionRollbackIn,
    db: AsyncSession = Depends(get_session),
):
    """回滚模型到指定版本。

    从 warehouse_model_versions 读取目标版本快照，
    恢复 DataSet 的 tables/relations/output_fields/model_meta。
    权限要求：warehouse.modeling:U
    """
    from app.datasets.models import DataSet, DataSetTable, DataSetRelation
    from sqlalchemy import text as sa_text

    ds = await db.get(DataSet, model_id)
    if ds is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=f"模型不存在: {model_id}")

    # 查找目标版本
    q = (
        select(WarehouseModelVersion)
        .where(
            WarehouseModelVersion.model_id == model_id,
            WarehouseModelVersion.version == payload.target_version,
        )
    )
    target_ver = (await db.execute(q)).scalars().first()
    if target_ver is None:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND,
            detail=f"版本不存在: model={model_id}, version={payload.target_version}",
        )

    snap = target_ver.snapshot or {}

    # 恢复模型元数据
    model_meta = snap.get("model", {})
    if model_meta.get("name"):
        ds.name = model_meta["name"]
    ds.description = model_meta.get("description")
    ds.warehouse_layer = model_meta.get("warehouse_layer", ds.warehouse_layer)
    ds.subject_area = model_meta.get("subject_area")
    ds.owner_name = model_meta.get("owner_name")

    # 恢复 tables
    await db.execute(sa_text("DELETE FROM dataset_tables WHERE dataset_id = :did"), {"did": model_id})
    for t in snap.get("tables", []):
        db.add(DataSetTable(dataset_id=model_id, table_name=t["table_name"], alias=t["alias"]))

    # 恢复 relations
    await db.execute(sa_text("DELETE FROM dataset_relations WHERE dataset_id = :did"), {"did": model_id})
    for r in snap.get("relations", []):
        db.add(DataSetRelation(
            dataset_id=model_id,
            left_alias=r["left_alias"],
            right_alias=r["right_alias"],
            join_type=r.get("join_type", "left"),
            cardinality=r.get("cardinality", "1:1"),
            keys=r.get("keys", []),
        ))

    # 恢复 output_fields: 先删后插
    await db.execute(sa_text("DELETE FROM dataset_output_fields WHERE dataset_id = :did"), {"did": model_id})
    for of_row in snap.get("output_fields", []):
        row_dict = {k: v for k, v in of_row.items() if k not in ("id", "created_at", "updated_at")}
        row_dict["dataset_id"] = model_id
        # 用 raw INSERT 避免不同模块的模型差异
        cols = ", ".join(row_dict.keys())
        placeholders = ", ".join(f":{k}" for k in row_dict)
        try:
            await db.execute(sa_text(f"INSERT INTO dataset_output_fields ({cols}) VALUES ({placeholders})"), row_dict)
        except Exception:
            pass

    # 更新版本号
    ds.version = payload.target_version
    ds.status = target_ver.status or "published"
    ds.diff_snapshot = target_ver.diff_snapshot

    await db.commit()
    return {"id": ds.id, "version": ds.version, "message": f"已回滚到版本 {payload.target_version}"}


# Q0509: V2 预览增强

@router.post(
    "/models/{model_id}/preview-v2",
    summary="V2 模型预览（SQL 生成 + 错误定位）",
    dependencies=[Depends(require_op("warehouse.modeling", "V"))],
)
async def preview_model_v2(
    model_id: int,
    limit: int = Query(20, ge=1, le=100),
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
):
    """V2 预览：返回生成的 SQL、关系解释文本、错误时定位到节点/连线。

    权限要求：warehouse.modeling:V
    """
    from app.datasets.models import DataSet, DataSetTable, DataSetRelation

    VALID_JOIN_TYPES = {"inner", "left", "right", "full"}

    ds = await db.get(DataSet, model_id)
    if ds is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=f"模型不存在: {model_id}")

    errors: list[dict] = []
    sql_parts: list[str] = []
    tables = (await db.execute(
        select(DataSetTable).where(DataSetTable.dataset_id == model_id)
    )).scalars().all()
    relations = (await db.execute(
        select(DataSetRelation).where(DataSetRelation.dataset_id == model_id)
    )).scalars().all()

    if not tables:
        errors.append({"node_id": f"dataset:{model_id}", "message": "模型未包含任何表"})
        return ModelPreviewV2Out(
            sql="", sql_explanation="",
            items=[], columns=[], total=0, errors=errors,
        )

    main = tables[0]
    main_tbl = _safe_ident(main.table_name)
    main_alias = _safe_ident(main.alias)
    sql_parts.append(f"FROM {main_tbl} AS {main_alias}")
    sql_explanation = f"主表: {main.table_name} (别名: {main.alias})"

    for rel in relations:
        left_t = next((t for t in tables if t.alias == rel.left_alias), None)
        right_t = next((t for t in tables if t.alias == rel.right_alias), None)
        if not left_t:
            errors.append({
                "node_id": f"relation:{rel.id}",
                "message": f"关联左表别名不存在: {rel.left_alias}",
            })
            continue
        if not right_t:
            errors.append({
                "node_id": f"relation:{rel.id}",
                "message": f"关联右表别名不存在: {rel.right_alias}",
            })
            continue

        jt = (rel.join_type or "left").lower()
        if jt not in VALID_JOIN_TYPES:
            errors.append({
                "node_id": f"relation:{rel.id}",
                "message": f"非法的 join_type: {rel.join_type}，允许值: {', '.join(sorted(VALID_JOIN_TYPES))}",
            })
            continue

        join_keyword = jt.upper() + " JOIN"
        right_tbl = _safe_ident(right_t.table_name)
        right_alias = _safe_ident(rel.right_alias)
        left_alias_safe = _safe_ident(rel.left_alias)

        join_clause = f"{join_keyword} {right_tbl} AS {right_alias} ON "
        key_parts = []
        for k in (rel.keys or []):
            if isinstance(k, dict):
                lf = _safe_ident(str(k.get("left", "")))
                rf = _safe_ident(str(k.get("right", "")))
                if lf and rf:
                    key_parts.append(f"{left_alias_safe}.{lf} = {right_alias}.{rf}")
        join_clause += " AND ".join(key_parts) if key_parts else "1=1"
        sql_parts.append(join_clause)
        sql_explanation += f"\n  {jt} JOIN {right_t.table_name} (别名: {rel.right_alias}) 关联键: {rel.keys}"

    sql = "SELECT * " + "\n".join(sql_parts) + f"\nLIMIT {limit}"
    # 尝试执行预览
    try:
        preview = await _svc(db).preview_model(model_id, limit=limit, user=user)
        return ModelPreviewV2Out(
            sql=sql,
            sql_explanation=sql_explanation,
            items=preview.get("items", []),
            columns=preview.get("columns", []),
            total=preview.get("summary", {}).get("result_count"),
            errors=errors,
        )
    except Exception as e:
        errors.append({"node_id": f"dataset:{model_id}", "message": f"预览执行错误: {str(e)}"})
        return ModelPreviewV2Out(
            sql=sql, sql_explanation=sql_explanation,
            items=[], columns=[], total=None, errors=errors,
        )


# ==================== 执行监控与告警 (Q06) ====================

# Q0602: 统一运行事件聚合

@router.get(
    "/runs",
    summary="仓内运行事件聚合",
    response_model=list[WarehouseRunSummaryOut],
    dependencies=[Depends(require_op("warehouse.governance", "V"))],
)
async def list_warehouse_runs(
    run_type: str | None = Query(None, description="sync/quality/dataset_build/metric_run/snapshot"),
    status: str | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(30, ge=1, le=200),
    db: AsyncSession = Depends(get_session),
):
    """聚合查询仓内运行记录。

    已实现：sync（SyncRun 表）、quality（WarehouseQualityRun 表）。
    占位：dataset_build / metric_run / snapshot（Phase 3 实现，暂无对应记录表）。
    权限要求：warehouse.governance:V
    """
    VALID_RUN_TYPES = {"sync", "quality", "dataset_build", "metric_run", "snapshot"}
    if run_type is not None and run_type not in VALID_RUN_TYPES:
        raise HTTPException(400, detail=f"无效的 run_type: {run_type}，允许值: {', '.join(sorted(VALID_RUN_TYPES))}")

    results: list[dict] = []
    include = lambda t: run_type is None or run_type == t

    # 1. SyncRun
    if include("sync"):
        from app.datasources.models import SyncRun
        sync_q = select(SyncRun).order_by(SyncRun.started_at.desc()).limit(page_size * 2)
        if status:
            sync_q = sync_q.where(SyncRun.status == status)
        sync_rows = (await db.execute(sync_q)).scalars().all()
        for r in sync_rows:
            results.append({
                "run_type": "sync", "run_id": r.id, "status": r.status,
                "target_label": f"同步 #{r.datasource_id}",
                "started_at": r.started_at, "finished_at": r.finished_at,
                "duration": (r.finished_at - r.started_at).total_seconds() if r.started_at and r.finished_at else None,
                "error_summary": r.message[:200] if r.message else None,
                "source_link": "/datasource/sync-runs",
            })

    # 2. QualityRun
    if include("quality"):
        quality_q = select(WarehouseQualityRun).order_by(WarehouseQualityRun.started_at.desc()).limit(page_size * 2)
        if status:
            quality_q = quality_q.where(WarehouseQualityRun.status == status)
        quality_rows = (await db.execute(quality_q)).scalars().all()
        for r in quality_rows:
            results.append({
                "run_type": "quality", "run_id": r.id, "status": r.status,
                "target_label": f"质量检查 #{r.rule_id}",
                "started_at": r.started_at, "finished_at": r.finished_at,
                "duration": (r.finished_at - r.started_at).total_seconds() if r.started_at and r.finished_at else None,
                "error_summary": r.message[:200] if r.message else None,
                "source_link": "/warehouse/quality",
            })

    # 3-5: dataset_build / metric_run / snapshot
    # Phase 3 实现：暂无对应记录表，不产生聚合数据。
    # 当 run_type 指定为这三种时，返回空列表而非 500。

    # 按时间排序 + 分页
    results.sort(key=lambda x: x.get("started_at") or "", reverse=True)
    offset = (page - 1) * page_size
    paged = results[offset:offset + page_size]

    return [WarehouseRunSummaryOut(**r) for r in paged]


# Q0605: 告警规则 CRUD

@router.get(
    "/alert-rules",
    summary="告警规则列表",
    dependencies=[Depends(require_op("warehouse.governance", "V"))],
)
async def list_alert_rules(db: AsyncSession = Depends(get_session)):
    q = select(WarehouseAlertRule).order_by(WarehouseAlertRule.created_at.desc())
    return (await db.execute(q)).scalars().all()


@router.post(
    "/alert-rules",
    summary="创建告警规则",
    response_model=WarehouseAlertRuleOut,
    status_code=201,
    dependencies=[Depends(require_op("warehouse.governance", "C"))],
)
async def create_alert_rule(payload: WarehouseAlertRuleIn, db: AsyncSession = Depends(get_session)):
    """创建告警规则（Q0605 占位：只保存规则，不发送通知）。"""
    _validate_alert_type(payload.alert_type)
    _validate_alert_severity(payload.severity)
    rule = WarehouseAlertRule(**payload.model_dump())
    db.add(rule)
    await db.commit()
    await db.refresh(rule)
    return rule


@router.delete(
    "/alert-rules/{rule_id}",
    summary="删除告警规则",
    status_code=204,
    dependencies=[Depends(require_op("warehouse.governance", "D"))],
)
async def delete_alert_rule(rule_id: int, db: AsyncSession = Depends(get_session)):
    rule = await db.get(WarehouseAlertRule, rule_id)
    if rule is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=f"告警规则不存在: {rule_id}")
    await db.delete(rule)
    await db.commit()
