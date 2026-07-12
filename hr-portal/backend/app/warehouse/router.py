# -*- coding: utf-8 -*-
"""数据仓库路由

路由前缀: /api/v1/warehouse
"""
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select, String
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
from app.warehouse.models import WarehouseQualityRule, WarehouseQualityRun, WarehouseAlertRule, WarehouseModelVersion, StandardizationRule, StandardizationTemplate
from app.warehouse.models import MetricResult, MetricRun, Dimension, DwsAggregateDefinition
from app.warehouse.quality_engine import execute_quality_rule, _safe_ident
from app.warehouse.schemas import (
    STANDARDIZATION_RULE_TYPES,
    StandardizationRuleIn,
    StandardizationRuleUpdateIn,
    StandardizationRuleOut,
    StandardizationTemplateIn,
    StandardizationTemplateUpdateIn,
    StandardizationTemplateOut,
    TemplateLoadRequest,
)
from app.warehouse.service import get_standardization_rule_service, get_standardization_template_service
from app.warehouse.service import get_metric_compute_service, get_dimension_service, get_dws_aggregate_service
from app.warehouse.schemas import (
    PreviewRequest, DwdViewGenerateRequest, DwdViewGenerateOut,
    REFRESH_STRATEGIES, RefreshStrategyUpdateIn, RefreshStrategyOut,
)
from app.warehouse.schemas import (
    MetricComputeIn, MetricComputeOut, MetricRecalcIn,
    MetricResultOut, MetricRunOut, MetricResultsPaginatedOut,
    DimensionCreateIn, DimensionUpdateIn, DimensionOut, DimensionTreeNode, DimensionImpactOut,
    DwsAggregateDefinitionCreateIn, DwsAggregateDefinitionUpdateIn, DwsAggregateDefinitionOut,
    DwsViewGenerateRequest, DwsViewGenerateOut,
    DWS_AGGREGATIONS, DWS_TIME_GRAINS,
    SnapshotJobIn, SnapshotJobUpdateIn, SnapshotTriggerIn,
    ScdConfigIn, ScdConfigUpdateIn,
    AdsDefinitionIn, AdsDefinitionUpdateIn,
    # Z0104 ODS→DWD 自动化配置
    OdsDwdAutomationConfigCreate, OdsDwdAutomationConfigUpdate, OdsDwdAutomationConfigOut,
    # X05 指标自动化数仓开发
    MetricAutomationDiagnosisOut, MetricAutomationDwsDraftIn, MetricAutomationDwsDraftOut,
    MetricAutomationViewPreviewIn, MetricAutomationViewPreviewOut,
    MetricAutomationPublishIn, MetricAutomationPublishOut,
    MetricAutomationRollbackIn,
    MetricAutomationAdsDraftIn, MetricAutomationAdsDraftOut,
    MetricChangePlanOut, MetricAutomationTimelineOut,
)

router = APIRouter(prefix="/warehouse", tags=["数据仓库"])


# ==================== 辅助 ====================

async def _publish_config_changed(table_name: str, change_type: str) -> None:
    """发布 ods_dwd_automation_config_changed 事件。"""
    try:
        from datetime import UTC, datetime as dt
        from app.automation.events import AutomationEvent, publish_event
        from app.core.db import get_session_factory
        async with get_session_factory()() as new_db:
            await publish_event(AutomationEvent(
                trigger_type="ods_dwd_automation_config_changed",
                biz_type="ods_table", biz_id=table_name,
                payload={"trigger_type": "ods_dwd_automation_config_changed", "table_name": table_name, "change_type": change_type,
                          "changed_at": dt.now(UTC).strftime("%Y-%m-%d %H:%M:%S")},
            ), new_db)
    except Exception:
        pass


async def _publish_metric_saved(metric_id: int) -> None:
    """发布 metric_saved 事件，触发 L4 级联检查。"""
    try:
        from datetime import UTC, datetime as dt
        from app.automation.events import AutomationEvent, publish_event
        from app.core.db import get_session_factory
        async with get_session_factory()() as new_db:
            await publish_event(AutomationEvent(
                trigger_type="metric_saved",
                biz_type="metric",
                biz_id=str(metric_id),
                payload={
                    "trigger_type": "metric_saved",
                    "metric_id": metric_id,
                    "changed_at": dt.now(UTC).strftime("%Y-%m-%d %H:%M:%S"),
                },
            ), new_db)
    except Exception:
        pass


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
        ods_dwd_automation=settings.WAREHOUSE_FEATURE_ODS_DWD_AUTOMATION,
        metric_automation=settings.WAREHOUSE_FEATURE_METRIC_AUTOMATION,
        l4_full_auto=settings.WAREHOUSE_FEATURE_L4_FULL_AUTO,
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
        await _publish_metric_saved(metric_id)
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


# ==================== R0103 标准化规则 CRUD ====================


def _validate_std_rule_type(value: str) -> None:
    if value not in STANDARDIZATION_RULE_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"无效的 rule_type: {value}，允许值: {', '.join(STANDARDIZATION_RULE_TYPES)}",
        )


# --- R0103: 规则列表 ---

@router.get(
    "/standardization-rules",
    summary="标准化规则列表",
    dependencies=[Depends(require_op("warehouse.modeling", "V"))],
)
async def list_std_rules(
    asset_type: str | None = Query(None),
    asset_code: str | None = Query(None),
    rule_type: str | None = Query(None),
    enabled: bool | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=200),
    db: AsyncSession = Depends(get_session),
):
    svc = get_standardization_rule_service(db)
    return await svc.list_rules(
        page=page, page_size=page_size,
        asset_type=asset_type, asset_code=asset_code,
        rule_type=rule_type, enabled=enabled,
    )


# --- R0103: 规则详情 ---

@router.get(
    "/standardization-rules/{rule_id}",
    summary="标准化规则详情",
    response_model=StandardizationRuleOut,
    dependencies=[Depends(require_op("warehouse.modeling", "V"))],
)
async def get_std_rule(rule_id: int, db: AsyncSession = Depends(get_session)):
    svc = get_standardization_rule_service(db)
    rule = await svc.get_rule(rule_id)
    if rule is None:
        raise HTTPException(status_code=404, detail=f"标准化规则不存在: {rule_id}")
    return rule


# --- R0103: 创建规则 ---

@router.post(
    "/standardization-rules",
    summary="创建标准化规则",
    response_model=StandardizationRuleOut,
    status_code=201,
    dependencies=[Depends(require_op("warehouse.modeling", "C"))],
)
async def create_std_rule(
    payload: StandardizationRuleIn,
    db: AsyncSession = Depends(get_session),
):
    _validate_std_rule_type(payload.rule_type)
    svc = get_standardization_rule_service(db)
    return await svc.create_rule(payload.model_dump())


# --- R0103: 更新规则 ---

@router.patch(
    "/standardization-rules/{rule_id}",
    summary="更新标准化规则",
    response_model=StandardizationRuleOut,
    dependencies=[Depends(require_op("warehouse.modeling", "U"))],
)
async def update_std_rule(
    rule_id: int,
    payload: StandardizationRuleUpdateIn,
    db: AsyncSession = Depends(get_session),
):
    svc = get_standardization_rule_service(db)
    rule = await svc.update_rule(rule_id, payload.model_dump(exclude_unset=True))
    if rule is None:
        raise HTTPException(status_code=404, detail=f"标准化规则不存在: {rule_id}")
    return rule


# --- R0103: 启用 ---

@router.post(
    "/standardization-rules/{rule_id}/enable",
    summary="启用标准化规则",
    response_model=StandardizationRuleOut,
    dependencies=[Depends(require_op("warehouse.modeling", "U"))],
)
async def enable_std_rule(rule_id: int, db: AsyncSession = Depends(get_session)):
    svc = get_standardization_rule_service(db)
    rule = await svc.set_enabled(rule_id, True)
    if rule is None:
        raise HTTPException(status_code=404, detail=f"标准化规则不存在: {rule_id}")
    return rule


# --- R0103: 禁用 ---

@router.post(
    "/standardization-rules/{rule_id}/disable",
    summary="禁用标准化规则",
    response_model=StandardizationRuleOut,
    dependencies=[Depends(require_op("warehouse.modeling", "U"))],
)
async def disable_std_rule(rule_id: int, db: AsyncSession = Depends(get_session)):
    svc = get_standardization_rule_service(db)
    rule = await svc.set_enabled(rule_id, False)
    if rule is None:
        raise HTTPException(status_code=404, detail=f"标准化规则不存在: {rule_id}")
    return rule


# --- R0103: 删除 ---

@router.delete(
    "/standardization-rules/{rule_id}",
    summary="删除标准化规则",
    status_code=204,
    dependencies=[Depends(require_op("warehouse.modeling", "D"))],
)
async def delete_std_rule(rule_id: int, db: AsyncSession = Depends(get_session)):
    svc = get_standardization_rule_service(db)
    ok = await svc.delete_rule(rule_id)
    if not ok:
        raise HTTPException(status_code=404, detail=f"标准化规则不存在: {rule_id}")
    return None


# ==================== R0106 标准化模板 CRUD ====================


@router.get(
    "/standardization-templates",
    summary="模板列表",
    dependencies=[Depends(require_op("warehouse.modeling", "V"))],
)
async def list_templates(
    business_object: str | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=200),
    db: AsyncSession = Depends(get_session),
):
    svc = get_standardization_template_service(db)
    return await svc.list_templates(page=page, page_size=page_size, business_object=business_object)


@router.get(
    "/standardization-templates/{template_id}",
    summary="模板详情",
    response_model=StandardizationTemplateOut,
    dependencies=[Depends(require_op("warehouse.modeling", "V"))],
)
async def get_template(template_id: int, db: AsyncSession = Depends(get_session)):
    svc = get_standardization_template_service(db)
    tpl = await svc.get_template(template_id)
    if tpl is None:
        raise HTTPException(status_code=404, detail=f"模板不存在: {template_id}")
    return tpl


@router.post(
    "/standardization-templates",
    summary="创建模板",
    response_model=StandardizationTemplateOut,
    status_code=201,
    dependencies=[Depends(require_op("warehouse.modeling", "C"))],
)
async def create_template(
    payload: StandardizationTemplateIn,
    db: AsyncSession = Depends(get_session),
):
    svc = get_standardization_template_service(db)
    return await svc.create_template(payload.model_dump())


@router.patch(
    "/standardization-templates/{template_id}",
    summary="更新模板",
    response_model=StandardizationTemplateOut,
    dependencies=[Depends(require_op("warehouse.modeling", "U"))],
)
async def update_template(
    template_id: int,
    payload: StandardizationTemplateUpdateIn,
    db: AsyncSession = Depends(get_session),
):
    svc = get_standardization_template_service(db)
    tpl = await svc.update_template(template_id, payload.model_dump(exclude_unset=True))
    if tpl is None:
        raise HTTPException(status_code=404, detail=f"模板不存在: {template_id}")
    return tpl


@router.delete(
    "/standardization-templates/{template_id}",
    summary="删除模板",
    status_code=204,
    dependencies=[Depends(require_op("warehouse.modeling", "D"))],
)
async def delete_template(template_id: int, db: AsyncSession = Depends(get_session)):
    svc = get_standardization_template_service(db)
    ok = await svc.delete_template(template_id)
    if not ok:
        raise HTTPException(status_code=404, detail=f"模板不存在: {template_id}")
    return None


@router.post(
    "/standardization-templates/{template_id}/load",
    summary="加载模板到表",
    status_code=200,
    dependencies=[Depends(require_op("warehouse.modeling", "U"))],
)
async def load_template(
    template_id: int,
    payload: TemplateLoadRequest,
    db: AsyncSession = Depends(get_session),
):
    svc = get_standardization_template_service(db)
    result = await svc.load_template_to_asset(
        template_id, payload.asset_code, payload.asset_type, payload.on_conflict,
    )
    if result is None:
        raise HTTPException(status_code=404, detail=f"模板不存在: {template_id}")
    return result


# ==================== R0107 标准化预览 ====================


@router.post(
    "/standardization-rules/preview",
    summary="预览标准化结果",
    dependencies=[Depends(require_op("warehouse.modeling", "V"))],
)
async def preview_standardization(
    payload: PreviewRequest,
    db: AsyncSession = Depends(get_session),
):
    """对 ODS 数据采样并预览标准化结果。

    支持两种方式传入规则：
    - rule_ids: 已保存的规则 ID（从 DB 加载）
    - inline_rules: 未保存的规则配置（保存前预览）
    两种方式可同时使用，inline_rules 会排在已保存规则之后执行。
    """
    svc = get_standardization_rule_service(db)
    rules = []

    # 加载已保存的规则
    for rid in payload.rule_ids:
        r = await svc.get_rule(rid)
        if r:
            rules.append({
                "rule_type": r.rule_type,
                "source_field": r.source_field,
                "target_field": r.target_field,
                "rule_config": r.rule_config,
                "display_order": r.display_order,
            })

    # 追加 inline 规则
    for ir in payload.inline_rules:
        rules.append({
            "rule_type": ir.rule_type,
            "source_field": ir.source_field,
            "target_field": ir.target_field,
            "rule_config": ir.rule_config,
            "display_order": ir.display_order,
        })

    if not rules:
        raise HTTPException(status_code=400, detail="至少提供一条规则（rule_ids 或 inline_rules）")

    preview_result = await svc.preview(
        asset_code=payload.asset_code,
        rules=rules,
        sample_size=payload.sample_size,
    )
    if preview_result is None:
        raise HTTPException(status_code=404, detail=f"ODS 表不存在: {payload.asset_code}")

    if "error" in preview_result:
        raise HTTPException(status_code=400, detail=preview_result["error"])

    return preview_result


# ==================== R0108 DWD 视图生成 ====================


@router.post(
    "/standardization-rules/generate-dwd-view",
    summary="发布为 DWD 视图",
    response_model=DwdViewGenerateOut,
    status_code=201,
    dependencies=[Depends(require_op("warehouse.modeling", "C"))],
)
async def generate_dwd_view(
    payload: DwdViewGenerateRequest,
    db: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
):
    """基于 ODS 表的标准化规则生成 DWD 逻辑视图（DataSet）。

    - 首次生成创建新 DataSet（warehouse_layer=DWD）
    - 重复生成更新已有 DataSet，版本号 +1
    - 输出字段和 SQL 视图定义自动刷新
    """
    svc = get_standardization_rule_service(db)
    result = await svc.generate_dwd_view(
        asset_code=payload.asset_code,
        asset_type=payload.asset_type,
        owner_user_id=user.id if user else None,
        owner_name=user.username if user else None,
    )
    if result is None:
        raise HTTPException(
            status_code=400,
            detail=f"ODS 表 {payload.asset_code} 没有启用的标准化规则，无法生成 DWD 视图",
        )
    if isinstance(result, dict) and "error" in result:
        raise HTTPException(status_code=400, detail=result.get("detail", str(result)))
    return result


# ==================== R01 全量执行 ODS→DWD ====================


class ExecuteFullRequest(BaseModel):
    model_config = {"extra": "forbid"}
    asset_code: str = Field(..., description="ODS 来源表名")
    target_table: str | None = Field(None, description="DWD 目标表名（可选，默认自动推导）")


@router.post(
    "/standardization-rules/execute",
    summary="全量执行 ODS→DWD 标准化",
    status_code=201,
    dependencies=[Depends(require_op("warehouse.modeling", "U"))],
)
async def execute_standardization(
    payload: ExecuteFullRequest,
    db: AsyncSession = Depends(get_session),
):
    """对 ODS 表全量执行所有已启用的标准化规则，写入 DWD 目标表。

    - 读取 ODS 全部数据 → 逐规则转换 → 写入目标表
    - 目标表已存在时 DROP + CREATE 重建
    - 自动注册到数据资产目录（warehouse_layer=DWD）
    - 返回成功/失败行数和错误明细

    权限要求：warehouse.modeling:U
    """
    svc = get_standardization_rule_service(db)
    result = await svc.execute_full(
        asset_code=payload.asset_code,
        target_table=payload.target_table,
    )
    if "error" in result:
        code_map = {"no_rules": 400, "empty": 200, "read_failed": 500, "transform_failed": 500, "invalid_source": 400, "invalid_target": 400, "write_failed": 500}
        status = code_map.get(result["error"], 500)
        raise HTTPException(status_code=status, detail=result.get("detail", str(result)))
    return result


# ==================== Z0104 ODS→DWD 自动化配置 CRUD ====================


async def _detect_ods_config(ods_table_name: str, db: AsyncSession) -> dict:
    """自动识别 ODS 表的同步语义、写入策略、业务主键。

    返回 ods_sync_semantics, dwd_write_strategy, missing_row_strategy, business_key_fields
    """
    from app.datasources.sync_service import PERIOD_TABLES
    from app.data.models import TableColumn

    # 1) 业务主键 — 从 table_columns 读取 is_pk_part=true 的字段
    pk_rows = (
        await db.execute(
            select(TableColumn.column_code)
            .where(TableColumn.table_name == ods_table_name, TableColumn.is_pk_part.is_(True))
            .order_by(TableColumn.display_order)
        )
    ).all()
    business_key_fields = [r[0] for r in pk_rows]

    # 2) 同步语义
    # 当前状态类表（全量快照）：HR名单、组织、成本中心、月度表
    FULL_SNAPSHOT_TABLES = {"emp_realtime_roster", "org_unit"}

    if ods_table_name in PERIOD_TABLES:
        cfg = PERIOD_TABLES[ods_table_name]
        if cfg.get("period_source") == "inject":
            return {"ods_sync_semantics": "full_snapshot", "dwd_write_strategy": "full_refresh",
                    "missing_row_strategy": "mark_inactive", "business_key_fields": business_key_fields}

    if ods_table_name in FULL_SNAPSHOT_TABLES:
        return {"ods_sync_semantics": "full_snapshot", "dwd_write_strategy": "incremental_upsert",
                "missing_row_strategy": "mark_inactive", "business_key_fields": business_key_fields}

    # 默认：增量 upsert
    return {"ods_sync_semantics": "incremental_upsert", "dwd_write_strategy": "incremental_upsert",
            "missing_row_strategy": "keep_history", "business_key_fields": business_key_fields}


@router.get(
    "/ods-dwd-automation-configs/{ods_table_name}/detect-semantics",
    summary="自动识别 ODS 表的同步语义",
    dependencies=[Depends(require_op("warehouse.assets", "V"))],
)
async def detect_ods_sync_semantics(
    ods_table_name: str,
    db: AsyncSession = Depends(get_session),
):
    """返回自动识别的 ODS 同步语义、DWD 写入策略、业务主键和缺失行处理策略。"""
    result = await _detect_ods_config(ods_table_name, db)
    result["ods_table_name"] = ods_table_name
    return result


@router.get(
    "/ods-dwd-automation-configs/{ods_table_name}",
    summary="获取 ODS 表的自动化配置",
    response_model=OdsDwdAutomationConfigOut,
    dependencies=[Depends(require_op("warehouse.assets", "V"))],
)
async def get_ods_dwd_automation_config(
    ods_table_name: str,
    db: AsyncSession = Depends(get_session),
):
    """获取指定 ODS 表的 ODS→DWD 自动化配置。"""
    from app.warehouse.models import OdsDwdAutomationConfig
    result = await db.execute(
        select(OdsDwdAutomationConfig).where(OdsDwdAutomationConfig.ods_table_name == ods_table_name)
    )
    config = result.scalar_one_or_none()
    if config is None:
        raise HTTPException(status_code=404, detail=f"ODS 表 {ods_table_name} 尚未配置自动化")
    return config


@router.get(
    "/ods-dwd-automation-configs",
    summary="列出所有 ODS→DWD 自动化配置",
    dependencies=[Depends(require_op("warehouse.assets", "V"))],
)
async def list_ods_dwd_automation_configs(
    update_mode: str | None = Query(None, description="更新模式过滤"),
    db: AsyncSession = Depends(get_session),
):
    """列出所有 ODS→DWD 自动化配置，支持按模式筛选。返回带中文表名。"""
    from app.warehouse.models import OdsDwdAutomationConfig
    from app.data.models import RegisteredTable

    stmt = select(OdsDwdAutomationConfig)
    if update_mode:
        stmt = stmt.where(OdsDwdAutomationConfig.update_mode == update_mode)
    stmt = stmt.order_by(OdsDwdAutomationConfig.updated_at.desc())
    result = await db.execute(stmt)
    configs = result.scalars().all()

    # 批量查询中文表名
    table_names = [c.ods_table_name for c in configs] + [c.target_dwd_table_name for c in configs if c.target_dwd_table_name]
    label_rows = (await db.execute(
        select(RegisteredTable.table_name, RegisteredTable.table_label)
        .where(RegisteredTable.table_name.in_(table_names))
    )).all()
    label_map = {r[0]: r[1] for r in label_rows}

    out = []
    for c in configs:
        d = OdsDwdAutomationConfigOut.model_validate(c).model_dump()
        d["ods_table_label"] = label_map.get(c.ods_table_name, c.ods_table_name)
        d["dwd_table_label"] = label_map.get(c.target_dwd_table_name, c.target_dwd_table_name or "-")
        out.append(d)

    return out


@router.post(
    "/ods-dwd-automation-configs",
    summary="创建 ODS→DWD 自动化配置",
    response_model=OdsDwdAutomationConfigOut,
    status_code=201,
    dependencies=[Depends(require_op("warehouse.assets", "U"))],
)
async def create_ods_dwd_automation_config(
    payload: OdsDwdAutomationConfigCreate,
    db: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
):
    """为 ODS 表创建自动化配置。

    校验规则：
    - cleaning_rule 模式必须绑定规则集 → 422
    - passthrough 模式必须绑定目标 DWD 资产 → 422
    - incremental_upsert 必须配置 business_key_fields → 422
    - full_snapshot 必须配置 missing_row_strategy → 422
    - 同一 ODS 表重复配置 → 409
    """
    from app.core.config import settings
    from app.warehouse.models import OdsDwdAutomationConfig

    if not settings.WAREHOUSE_FEATURE_ODS_DWD_AUTOMATION:
        raise HTTPException(status_code=403, detail="ODS→DWD 自动化功能未启用")

    # 去重检查
    existing = await db.execute(
        select(OdsDwdAutomationConfig).where(OdsDwdAutomationConfig.ods_table_name == payload.ods_table_name)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail=f"ODS 表 {payload.ods_table_name} 已存在自动化配置")

    # cleaning_rule 模式：检查 ODS 表是否已有启用的清洗规则
    if payload.update_mode == "cleaning_rule":
        from app.warehouse.models import StandardizationRule
        rule_count = await db.execute(
            select(func.count()).select_from(StandardizationRule).where(
                StandardizationRule.asset_code == payload.ods_table_name,
                StandardizationRule.enabled.is_(True),
            )
        )
        if (rule_count.scalar() or 0) == 0:
            raise HTTPException(status_code=422, detail="该 ODS 表尚未配置清洗规则，请先在配方构建器中添加规则")

    # passthrough 模式校验
    if payload.update_mode == "passthrough" and not payload.target_dwd_table_name:
        raise HTTPException(status_code=422, detail="passthrough 模式必须指定目标 DWD 表名/视图名")

    # incremental_upsert 必须配置业务主键
    if payload.dwd_write_strategy == "incremental_upsert" and not payload.business_key_fields:
        raise HTTPException(status_code=422, detail="incremental_upsert 写入策略必须配置业务主键字段")

    # full_snapshot 必须配置缺失行策略
    if payload.ods_sync_semantics == "full_snapshot" and not payload.missing_row_strategy:
        raise HTTPException(status_code=422, detail="full_snapshot 同步语义必须配置缺失行处理策略")

    # 自动识别仅补充未填字段，不覆盖用户显式设置的值
    detected = await _detect_ods_config(payload.ods_table_name, db)

    config = OdsDwdAutomationConfig(
        ods_table_name=payload.ods_table_name,
        target_dwd_asset_id=payload.target_dwd_asset_id,
        target_dwd_table_name=payload.target_dwd_table_name,
        update_mode=payload.update_mode,
        ods_sync_semantics=payload.ods_sync_semantics,
        dwd_write_strategy=payload.dwd_write_strategy,
        business_key_fields=payload.business_key_fields or detected.get("business_key_fields"),
        missing_row_strategy=payload.missing_row_strategy,
        standardization_rule_set_id=payload.standardization_rule_set_id,
        standardization_rule_ids=payload.standardization_rule_ids,
        trigger_strategy="on_sync_success",
        enabled=payload.enabled,
        created_by=user.login_name if user else None,
    )
    db.add(config)
    await db.commit()
    await db.refresh(config)
    await _publish_config_changed(payload.ods_table_name, "created")
    return config


@router.put(
    "/ods-dwd-automation-configs/{ods_table_name}",
    summary="更新 ODS→DWD 自动化配置",
    response_model=OdsDwdAutomationConfigOut,
    dependencies=[Depends(require_op("warehouse.assets", "U"))],
)
async def update_ods_dwd_automation_config(
    ods_table_name: str,
    payload: OdsDwdAutomationConfigUpdate,
    db: AsyncSession = Depends(get_session),
):
    """更新 ODS 表的自动化配置。"""
    from app.warehouse.models import OdsDwdAutomationConfig

    result = await db.execute(
        select(OdsDwdAutomationConfig).where(OdsDwdAutomationConfig.ods_table_name == ods_table_name)
    )
    config = result.scalar_one_or_none()
    if config is None:
        raise HTTPException(status_code=404, detail=f"ODS 表 {ods_table_name} 尚未配置自动化")

    update_data = payload.model_dump(exclude_unset=True)

    # 自动检测仅补充未显式设置的字段，不覆盖用户输入
    detected = await _detect_ods_config(ods_table_name, db)
    if "business_key_fields" not in update_data:
        update_data["business_key_fields"] = detected.get("business_key_fields")

    # 计算合并后的值
    merged_mode = update_data.get("update_mode", config.update_mode)
    merged_dwd = update_data.get("dwd_write_strategy", config.dwd_write_strategy)
    merged_sync = update_data.get("ods_sync_semantics", config.ods_sync_semantics)
    merged_biz_keys = update_data.get("business_key_fields", config.business_key_fields)
    merged_target = update_data.get("target_dwd_table_name", config.target_dwd_table_name)

    # cleaning_rule 模式：检查 ODS 表是否已有启用的清洗规则
    if merged_mode == "cleaning_rule":
        from app.warehouse.models import StandardizationRule
        rule_count = await db.execute(
            select(func.count()).select_from(StandardizationRule).where(
                StandardizationRule.asset_code == ods_table_name,
                StandardizationRule.enabled.is_(True),
            )
        )
        if (rule_count.scalar() or 0) == 0:
            raise HTTPException(status_code=422, detail="该 ODS 表尚未配置清洗规则，请先在配方构建器中添加规则")

    # passthrough 模式必须绑定目标 DWD 资产
    if merged_mode == "passthrough" and not merged_target:
        raise HTTPException(status_code=422, detail="passthrough 模式必须指定目标 DWD 表名/视图名")

    # incremental_upsert 必须配置业务主键
    if merged_dwd == "incremental_upsert" and not merged_biz_keys:
        raise HTTPException(status_code=422, detail="incremental_upsert 写入策略必须配置业务主键字段")

    # full_snapshot 必须配置缺失行策略
    missing_merged = update_data.get("missing_row_strategy", config.missing_row_strategy)
    if merged_sync == "full_snapshot" and not missing_merged:
        raise HTTPException(status_code=422, detail="full_snapshot 同步语义必须配置缺失行处理策略")

    for key, value in update_data.items():
        setattr(config, key, value)

    await db.commit()
    await db.refresh(config)
    await _publish_config_changed(ods_table_name, "updated")
    return config


@router.delete(
    "/ods-dwd-automation-configs/{ods_table_name}",
    summary="删除 ODS→DWD 自动化配置",
    status_code=204,
    dependencies=[Depends(require_op("warehouse.assets", "D"))],
)
async def delete_ods_dwd_automation_config(
    ods_table_name: str,
    db: AsyncSession = Depends(get_session),
):
    """删除 ODS 表的自动化配置。"""
    from app.warehouse.models import OdsDwdAutomationConfig

    result = await db.execute(
        select(OdsDwdAutomationConfig).where(OdsDwdAutomationConfig.ods_table_name == ods_table_name)
    )
    config = result.scalar_one_or_none()
    if config is None:
        raise HTTPException(status_code=404, detail=f"ODS 表 {ods_table_name} 尚未配置自动化")

    await db.delete(config)
    await db.commit()
    await _publish_config_changed(ods_table_name, "deleted")
    return None


# ==================== Z0107 ODS→DWD 自动化执行审计 ====================

ODS_DWD_AUTOMATION_TRIGGERS = (
    "datasource_sync_completed",
    "ods_table_data_changed",
    "ods_table_metadata_changed",
    "standardization_rule_changed",
    "ods_dwd_automation_config_changed",
)

ODS_DWD_TRIGGER_LABELS: dict[str, str] = {
    "datasource_sync_completed": "数据源同步",
    "ods_table_data_changed": "ODS数据变更",
    "ods_table_metadata_changed": "ODS元数据变更",
    "standardization_rule_changed": "清洗规则变更",
    "ods_dwd_automation_config_changed": "自动化配置变更",
}


@router.get(
    "/ods-dwd-automation-executions/{ods_table_name}",
    summary="查询 ODS 表的自动执行记录",
    dependencies=[Depends(require_op("warehouse.assets", "V"))],
)
async def list_ods_dwd_automation_executions(
    ods_table_name: str,
    page_size: int = Query(5, ge=1, le=50, description="返回条数"),
    db: AsyncSession = Depends(get_session),
):
    """查询指定 ODS 表的 ODS→DWD 自动执行记录（最近 N 条）。"""
    from app.automation.models import AutomationExecution, AutomationActionExecution
    from sqlalchemy import text as sa_text

    result = await db.execute(
        select(AutomationExecution)
        .where(
            AutomationExecution.trigger_type.in_(ODS_DWD_AUTOMATION_TRIGGERS),
            AutomationExecution.event_payload["table_name"].cast(String) == ods_table_name,
        )
        .order_by(AutomationExecution.started_at.desc())
        .limit(page_size)
    )
    matching = result.scalars().all()

    # 批量加载 action 执行记录
    exec_ids = [e.id for e in matching]
    action_results: dict[int, list[dict]] = {}
    if exec_ids:
        action_rows = await db.execute(
            select(AutomationActionExecution)
            .where(AutomationActionExecution.execution_id.in_(exec_ids))
            .order_by(AutomationActionExecution.action_index)
        )
        for a in action_rows.scalars().all():
            action_results.setdefault(a.execution_id, []).append({
                "action_type": a.action_type,
                "status": a.status,
                "output": a.output_snapshot,
                "error": a.error_message,
                "started_at": a.started_at.isoformat() if a.started_at else None,
                "finished_at": a.finished_at.isoformat() if a.finished_at else None,
            })

    output: list[dict] = []
    for e in matching:
        p = e.event_payload or {}
        action_output = (action_results.get(e.id, [{}]) or [{}])[0].get("output") or {}
        output.append({
            "id": e.id,
            "rule_id": e.rule_id,
            "trigger_type": e.trigger_type,
            "trigger_label": ODS_DWD_TRIGGER_LABELS.get(e.trigger_type, e.trigger_type),
            "biz_type": e.biz_type,
            "biz_id": e.biz_id,
            "event_payload": p,
            "status": e.status,
            "mode": action_output.get("mode", ""),
            "rows": action_output.get("rows", 0),
            "error_message": e.error_message or action_output.get("detail", ""),
            "started_at": e.started_at.isoformat() if e.started_at else None,
            "finished_at": e.finished_at.isoformat() if e.finished_at else None,
            "actions": action_results.get(e.id, []),
        })

    return output


@router.get(
    "/ods-dwd-automation-executions",
    summary="列出所有 ODS→DWD 自动执行记录",
    dependencies=[Depends(require_op("warehouse.assets", "V"))],
)
async def list_all_ods_dwd_automation_executions(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status: str | None = Query(None, description="success/failed/running"),
    db: AsyncSession = Depends(get_session),
):
    """分页列出所有 ODS→DWD 自动化执行记录。"""
    from app.automation.models import AutomationExecution

    stmt = select(AutomationExecution).where(
        AutomationExecution.trigger_type.in_(ODS_DWD_AUTOMATION_TRIGGERS)
    )
    if status:
        stmt = stmt.where(AutomationExecution.status == status)
    stmt = stmt.order_by(AutomationExecution.started_at.desc())

    # 总数
    count_stmt = select(func.count()).select_from(stmt.subquery())
    total = (await db.execute(count_stmt)).scalar() or 0

    # 分页
    stmt = stmt.offset((page - 1) * page_size).limit(page_size)
    rows = (await db.execute(stmt)).scalars().all()

    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "items": [
            {
                "id": e.id,
                "trigger_type": e.trigger_type,
                "status": e.status,
                "error_message": e.error_message,
                "started_at": e.started_at.isoformat() if e.started_at else None,
                "finished_at": e.finished_at.isoformat() if e.finished_at else None,
            }
            for e in rows
        ],
    }


# ==================== 手动触发 ODS→DWD 同步 ====================


@router.post(
    "/ods-dwd-automation-configs/{ods_table_name}/trigger",
    summary="手动触发 ODS→DWD 同步",
    dependencies=[Depends(require_op("warehouse.assets", "U"))],
)
async def trigger_ods_dwd_sync(
    ods_table_name: str,
    db: AsyncSession = Depends(get_session),
):
    """立即触发一次 ODS→DWD 同步，与自动触发逻辑一致：有清洗规则→清洗，无→直通。"""
    from app.automation.events import AutomationEvent, publish_event
    from app.core.db import get_session_factory

    async with get_session_factory()() as new_db:
        await publish_event(
            AutomationEvent(
                trigger_type="ods_table_data_changed",
                biz_type="ods_table",
                biz_id=ods_table_name,
                payload={
                    "trigger_type": "ods_table_data_changed",
                    "table_name": ods_table_name,
                    "source": "manual_trigger",
                    "change_type": "manual_trigger",
                    "affected_row_count": 0,
                    "changed_by": "user",
                    "changed_at": "",
                },
            ),
            new_db,
        )

    return {"ok": True, "message": f"已触发 {ods_table_name} 的 ODS→DWD 同步"}


# ==================== R0202 数据集物化构建 ====================


@router.post(
    "/datasets/{dataset_id}/build",
    summary="构建/物化数据集",
    status_code=202,
    dependencies=[Depends(require_op("warehouse.modeling", "U"))],
)
async def build_dataset(
    dataset_id: int,
    db: AsyncSession = Depends(get_session),
):
    """将 virtual DataSet 物化为物理表。

    - 校验分层流转（ODS→DWD→DWS→ADS），非法跳转返回 400
    - 只处理已入仓数据，不触发 UCP/DataSource 实时拉取
    """
    svc = _svc(db)
    result = await svc.build_dataset(dataset_id)

    if "error" in result:
        code_map = {"not_found": 404, "build_mode": 400, "layer_check": 400}
        raise HTTPException(
            status_code=code_map.get(result["error"], 500),
            detail=result["detail"],
        )

    return result


# ==================== R0204 刷新策略 ====================


@router.get(
    "/datasets/{dataset_id}/refresh-strategy",
    summary="获取数据集刷新策略",
    response_model=RefreshStrategyOut,
    dependencies=[Depends(require_op("warehouse.modeling", "V"))],
)
async def get_refresh_strategy(dataset_id: int, db: AsyncSession = Depends(get_session)):
    """获取数据集的 build_mode 和 refresh_strategy。"""
    from app.datasets.models import DataSet
    ds = await db.get(DataSet, dataset_id)
    if ds is None:
        raise HTTPException(status_code=404, detail=f"数据集不存在: {dataset_id}")
    return RefreshStrategyOut(
        dataset_id=ds.id,
        refresh_strategy=getattr(ds, "refresh_strategy", "manual") or "manual",
        build_mode=getattr(ds, "build_mode", "virtual") or "virtual",
    )


@router.patch(
    "/datasets/{dataset_id}/refresh-strategy",
    summary="更新数据集刷新策略",
    response_model=RefreshStrategyOut,
    dependencies=[Depends(require_op("warehouse.modeling", "U"))],
)
async def update_refresh_strategy(
    dataset_id: int,
    payload: RefreshStrategyUpdateIn,
    db: AsyncSession = Depends(get_session),
):
    from app.datasets.models import DataSet
    from app.warehouse.schemas import REFRESH_STRATEGIES

    if payload.refresh_strategy not in REFRESH_STRATEGIES:
        raise HTTPException(status_code=400, detail=f"无效策略: {payload.refresh_strategy}，允许: {', '.join(REFRESH_STRATEGIES)}")

    ds = await db.get(DataSet, dataset_id)
    if ds is None:
        raise HTTPException(status_code=404, detail=f"数据集不存在: {dataset_id}")
    ds.refresh_strategy = payload.refresh_strategy
    await db.commit()
    await db.refresh(ds)
    return RefreshStrategyOut(
        dataset_id=ds.id,
        refresh_strategy=ds.refresh_strategy,
        build_mode=getattr(ds, "build_mode", "virtual") or "virtual",
    )


# ==================== R0302 指标计算 ====================


@router.post(
    "/metrics/{metric_id}/compute",
    summary="触发指标计算",
    response_model=MetricComputeOut,
    status_code=201,
    dependencies=[Depends(require_op("warehouse.metrics", "U"))],
)
async def compute_metric(
    metric_id: int,
    payload: MetricComputeIn,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
):
    """触发单次指标计算，同步返回结果。

    已归档指标不可计算（400）。
    权限要求：warehouse.metrics:U
    """
    svc = get_metric_compute_service(db)
    result = await svc.compute_metric(metric_id, payload.period, user.id)
    if "error" in result:
        code_map = {"not_found": 404, "bad_request": 400}
        raise HTTPException(status_code=code_map.get(result["error"], 500), detail=result["detail"])
    await db.commit()
    return result


@router.post(
    "/metrics/{metric_id}/recalc",
    summary="重算指标",
    response_model=MetricComputeOut,
    status_code=201,
    dependencies=[Depends(require_op("warehouse.metrics", "U"))],
)
async def recalc_metric(
    metric_id: int,
    payload: MetricRecalcIn,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
):
    """重算指标，覆盖同周期已有结果。

    权限要求：warehouse.metrics:U
    """
    svc = get_metric_compute_service(db)
    result = await svc.recalc_metric(metric_id, payload.period, user.id)
    if "error" in result:
        code_map = {"not_found": 404, "bad_request": 400}
        raise HTTPException(status_code=code_map.get(result["error"], 500), detail=result["detail"])
    await db.commit()
    return result


@router.get(
    "/metrics/{metric_id}/results",
    summary="指标计算结果历史",
    response_model=MetricResultsPaginatedOut,
    dependencies=[Depends(require_op("warehouse.metrics", "V"))],
)
async def list_metric_results(
    metric_id: int,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=200),
    db: AsyncSession = Depends(get_session),
):
    """查询指标计算结果列表（按周期倒序）。

    指标不存在时返回 404。
    权限要求：warehouse.metrics:V
    """
    from app.datasets.models import WarehouseMetric
    m = await db.get(WarehouseMetric, metric_id)
    if m is None:
        raise HTTPException(status_code=404, detail=f"指标不存在: {metric_id}")

    svc = get_metric_compute_service(db)
    return await svc.list_results(metric_id, page=page, page_size=page_size)


@router.get(
    "/metrics/{metric_id}/runs",
    summary="指标运行记录",
    dependencies=[Depends(require_op("warehouse.metrics", "V"))],
)
async def list_metric_runs(
    metric_id: int,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=200),
    db: AsyncSession = Depends(get_session),
):
    """查询指标计算运行记录（按时间倒序）。

    指标不存在时返回 404。
    权限要求：warehouse.metrics:V
    """
    from app.datasets.models import WarehouseMetric
    m = await db.get(WarehouseMetric, metric_id)
    if m is None:
        raise HTTPException(status_code=404, detail=f"指标不存在: {metric_id}")

    svc = get_metric_compute_service(db)
    return await svc.list_runs(metric_id, page=page, page_size=page_size)


# ==================== R0305 维度定义 CRUD ====================


@router.get(
    "/dimensions",
    summary="维度列表",
    response_model=list[DimensionOut],
    dependencies=[Depends(require_op("warehouse.modeling", "V"))],
)
async def list_dimensions(db: AsyncSession = Depends(get_session)):
    """获取所有维度的平铺列表。

    权限要求：warehouse.modeling:V
    """
    svc = get_dimension_service(db)
    return await svc.list_dimensions()


@router.get(
    "/dimensions/tree",
    summary="维度层级树",
    response_model=list[DimensionTreeNode],
    dependencies=[Depends(require_op("warehouse.modeling", "V"))],
)
async def get_dimension_tree(db: AsyncSession = Depends(get_session)):
    """获取维度的层级树结构。

    权限要求：warehouse.modeling:V
    """
    svc = get_dimension_service(db)
    return await svc.get_tree()


@router.get(
    "/dimensions/{dim_id}",
    summary="维度详情",
    response_model=DimensionOut,
    dependencies=[Depends(require_op("warehouse.modeling", "V"))],
)
async def get_dimension(dim_id: int, db: AsyncSession = Depends(get_session)):
    svc = get_dimension_service(db)
    result = await svc.get_dimension(dim_id)
    if result is None:
        raise HTTPException(status_code=404, detail=f"维度不存在: {dim_id}")
    return result


@router.post(
    "/dimensions",
    summary="创建维度",
    response_model=DimensionOut,
    status_code=201,
    dependencies=[Depends(require_op("warehouse.modeling", "C"))],
)
async def create_dimension(payload: DimensionCreateIn, db: AsyncSession = Depends(get_session)):
    """创建维度（dimension_code 唯一；parent_id 校验循环引用）。

    权限要求：warehouse.modeling:C
    """
    svc = get_dimension_service(db)
    try:
        result = await svc.create_dimension(payload.model_dump())
        await db.commit()
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.patch(
    "/dimensions/{dim_id}",
    summary="更新维度",
    response_model=DimensionOut,
    dependencies=[Depends(require_op("warehouse.modeling", "U"))],
)
async def update_dimension(
    dim_id: int,
    payload: DimensionUpdateIn,
    db: AsyncSession = Depends(get_session),
):
    svc = get_dimension_service(db)
    try:
        d = await svc.update_dimension(dim_id, payload.model_dump(exclude_unset=True))
        if d is None:
            raise HTTPException(status_code=404, detail=f"维度不存在: {dim_id}")
        await db.commit()
        await db.refresh(d)
        return await svc.get_dimension(dim_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete(
    "/dimensions/{dim_id}",
    summary="删除维度",
    status_code=204,
    dependencies=[Depends(require_op("warehouse.modeling", "D"))],
)
async def delete_dimension(dim_id: int, db: AsyncSession = Depends(get_session)):
    """删除维度，子维度自动置为根节点。

    权限要求：warehouse.modeling:D
    """
    svc = get_dimension_service(db)
    ok = await svc.delete_dimension(dim_id)
    if not ok:
        raise HTTPException(status_code=404, detail=f"维度不存在: {dim_id}")
    await db.commit()
    return None


@router.get(
    "/dimensions/{dim_id}/impact",
    summary="维度删除影响分析",
    response_model=DimensionImpactOut,
    dependencies=[Depends(require_op("warehouse.modeling", "V"))],
)
async def get_dimension_impact(dim_id: int, db: AsyncSession = Depends(get_session)):
    svc = get_dimension_service(db)
    result = await svc.get_impact(dim_id)
    if result is None:
        raise HTTPException(status_code=404, detail=f"维度不存在: {dim_id}")
    return result


# ==================== R0308 DWS 聚合定义 CRUD ====================


def _validate_aggregation(value: str) -> None:
    if value not in DWS_AGGREGATIONS:
        raise HTTPException(400, detail=f"无效的 aggregation: {value}，允许值: {', '.join(DWS_AGGREGATIONS)}")


@router.get(
    "/dws-aggregates",
    summary="DWS 聚合定义列表",
    dependencies=[Depends(require_op("warehouse.modeling", "V"))],
)
async def list_dws_aggregates(
    metric_id: int | None = Query(None),
    status: str | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=200),
    db: AsyncSession = Depends(get_session),
):
    svc = get_dws_aggregate_service(db)
    return await svc.list_aggregates(metric_id=metric_id, status=status, page=page, page_size=page_size)


@router.get(
    "/dws-aggregates/{agg_id}",
    summary="DWS 聚合定义详情",
    response_model=DwsAggregateDefinitionOut,
    dependencies=[Depends(require_op("warehouse.modeling", "V"))],
)
async def get_dws_aggregate(agg_id: int, db: AsyncSession = Depends(get_session)):
    svc = get_dws_aggregate_service(db)
    result = await svc.get_aggregate(agg_id)
    if result is None:
        raise HTTPException(status_code=404, detail=f"聚合定义不存在: {agg_id}")
    return result


@router.post(
    "/dws-aggregates",
    summary="创建 DWS 聚合定义",
    response_model=DwsAggregateDefinitionOut,
    status_code=201,
    dependencies=[Depends(require_op("warehouse.modeling", "C"))],
)
async def create_dws_aggregate(
    payload: DwsAggregateDefinitionCreateIn,
    db: AsyncSession = Depends(get_session),
):
    _validate_aggregation(payload.aggregation)
    svc = get_dws_aggregate_service(db)
    try:
        result = await svc.create_aggregate(payload.model_dump())
        await db.commit()
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.patch(
    "/dws-aggregates/{agg_id}",
    summary="更新 DWS 聚合定义",
    response_model=DwsAggregateDefinitionOut,
    dependencies=[Depends(require_op("warehouse.modeling", "U"))],
)
async def update_dws_aggregate(
    agg_id: int,
    payload: DwsAggregateDefinitionUpdateIn,
    db: AsyncSession = Depends(get_session),
):
    svc = get_dws_aggregate_service(db)
    data = payload.model_dump(exclude_unset=True)
    if "aggregation" in data:
        _validate_aggregation(data["aggregation"])
    try:
        a = await svc.update_aggregate(agg_id, data)
        if a is None:
            raise HTTPException(status_code=404, detail=f"聚合定义不存在: {agg_id}")
        await db.commit()
        await db.refresh(a)
        return await svc.get_aggregate(agg_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete(
    "/dws-aggregates/{agg_id}",
    summary="删除 DWS 聚合定义",
    status_code=204,
    dependencies=[Depends(require_op("warehouse.modeling", "D"))],
)
async def delete_dws_aggregate(agg_id: int, db: AsyncSession = Depends(get_session)):
    svc = get_dws_aggregate_service(db)
    ok = await svc.delete_aggregate(agg_id)
    if not ok:
        raise HTTPException(status_code=404, detail=f"聚合定义不存在: {agg_id}")
    await db.commit()
    return None


@router.post(
    "/dws-aggregates/{agg_id}/publish",
    summary="发布 DWS 聚合定义",
    response_model=DwsAggregateDefinitionOut,
    dependencies=[Depends(require_op("warehouse.modeling", "U"))],
)
async def publish_dws_aggregate(agg_id: int, db: AsyncSession = Depends(get_session)):
    svc = get_dws_aggregate_service(db)
    try:
        result = await svc.publish_aggregate(agg_id)
        if result is None:
            raise HTTPException(status_code=404, detail=f"聚合定义不存在: {agg_id}")
        await db.commit()
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post(
    "/dws-aggregates/{agg_id}/archive",
    summary="归档 DWS 聚合定义",
    response_model=DwsAggregateDefinitionOut,
    dependencies=[Depends(require_op("warehouse.modeling", "U"))],
)
async def archive_dws_aggregate(agg_id: int, db: AsyncSession = Depends(get_session)):
    svc = get_dws_aggregate_service(db)
    try:
        result = await svc.archive_aggregate(agg_id)
        if result is None:
            raise HTTPException(status_code=404, detail=f"聚合定义不存在: {agg_id}")
        await db.commit()
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post(
    "/dws-aggregates/validate",
    summary="校验 DWS 聚合定义",
    dependencies=[Depends(require_op("warehouse.modeling", "C"))],
)
async def validate_dws_aggregate(
    payload: DwsAggregateDefinitionCreateIn,
    db: AsyncSession = Depends(get_session),
):
    """保存前校验聚合定义的合法性。

    权限要求：warehouse.modeling:C
    """
    svc = get_dws_aggregate_service(db)
    return await svc.validate_aggregate(payload.model_dump())


# ==================== R0310 DWS 视图生成 ====================


@router.post(
    "/dws-aggregates/{agg_id}/generate-view",
    summary="生成 DWS 逻辑视图",
    response_model=DwsViewGenerateOut,
    status_code=201,
    dependencies=[Depends(require_op("warehouse.modeling", "C"))],
)
async def generate_dws_view(
    agg_id: int,
    db: AsyncSession = Depends(get_session),
):
    """根据已发布的聚合定义生成 DWS 逻辑视图（DataSet 资产）。

    聚合定义不存在时返回 404。
    权限要求：warehouse.modeling:C
    """
    svc = get_dws_aggregate_service(db)
    result = await svc.generate_dws_view(agg_id)
    if result is None:
        raise HTTPException(status_code=404, detail=f"聚合定义不存在: {agg_id}")
    await db.commit()
    return result


@router.get(
    "/dws-aggregates/{agg_id}/view-impact",
    summary="DWS 视图生成影响分析",
    dependencies=[Depends(require_op("warehouse.modeling", "V"))],
)
async def get_dws_view_impact(agg_id: int, db: AsyncSession = Depends(get_session)):
    """生成视图前的影响分析：依赖模型、警告信息、预计输出字段。

    权限要求：warehouse.modeling:V
    """
    svc = get_dws_aggregate_service(db)
    result = await svc.get_view_impact(agg_id)
    if result is None:
        raise HTTPException(status_code=404, detail=f"聚合定义不存在: {agg_id}")
    return result


# ==================== X05 指标自动化数仓开发 ====================

from app.warehouse.service.metric_automation import get_metric_automation_service


@router.get(
    "/metric-automation/diagnose/{metric_id}",
    summary="指标自动化诊断（X0502）",
    dependencies=[Depends(require_op("warehouse.metrics", "V"))],
)
async def metric_automation_diagnose(
    metric_id: int,
    db: AsyncSession = Depends(get_session),
):
    """诊断指标是否可自动化生成 DWS/ADS 草稿。

    返回 autamatable 标记 + errors/warnings/suggestions。
    不可自动化时会列出缺失维度、非法聚合、无权限字段或口径不完整原因。
    权限要求：warehouse.metrics:V
    """
    svc = get_metric_automation_service(db)
    return await svc.diagnose_metric(metric_id)


@router.post(
    "/metric-automation/dws-draft",
    summary="生成 DWS 草稿（X0503）",
    dependencies=[Depends(require_op("warehouse.metrics", "U"))],
)
async def metric_automation_generate_dws_draft(
    payload: MetricAutomationDwsDraftIn,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
):
    """根据指标定义生成 DWS 聚合草稿。

    只生成草稿（status=draft），不直接发布生产资产。
    权限要求：warehouse.metrics:U
    """
    if not settings.WAREHOUSE_FEATURE_METRIC_AUTOMATION:
        raise HTTPException(status_code=403, detail="指标自动化 feature flag 未开启")
    svc = get_metric_automation_service(db)
    result = await svc.generate_dws_draft(payload.metric_id, payload.model_dump(exclude_unset=True))
    if result.get("status") == "failed":
        raise HTTPException(status_code=400, detail=result.get("error", "生成失败"))
    return result


@router.post(
    "/metric-automation/preview",
    summary="DWS/ADS 草稿预览与门禁（X0504/X0505）",
    dependencies=[Depends(require_op("warehouse.metrics", "V"))],
)
async def metric_automation_preview(
    payload: MetricAutomationViewPreviewIn,
    db: AsyncSession = Depends(get_session),
):
    """预览 DWS/ADS 草稿：SQL 摘要、质量门禁、小样本风险、数据样例。

    权限要求：warehouse.metrics:V
    """
    if not settings.WAREHOUSE_FEATURE_METRIC_AUTOMATION:
        raise HTTPException(status_code=403, detail="指标自动化 feature flag 未开启")
    svc = get_metric_automation_service(db)
    result = await svc.preview_draft(payload.draft_id, payload.draft_type, payload.sample_size)
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    return result


@router.post(
    "/metric-automation/publish",
    summary="发布 DWS/ADS 草稿（X0506/X0508）",
    dependencies=[Depends(require_op("warehouse.metrics", "U"))],
)
async def metric_automation_publish(
    payload: MetricAutomationPublishIn,
    request: Request,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
):
    """人工确认后发布 DWS/ADS 草稿为生产 View。

    发布前自动执行质量门禁和小样本风险检查，阻断项存在时拒绝发布。
    发布后写入血缘和审计。
    权限要求：warehouse.metrics:U
    """
    if not settings.WAREHOUSE_FEATURE_METRIC_AUTOMATION:
        raise HTTPException(status_code=403, detail="指标自动化 feature flag 未开启")
    if not payload.confirmed:
        raise HTTPException(status_code=400, detail="需要人工确认发布")
    svc = get_metric_automation_service(db, trace_id=request.headers.get("X-Trace-Id") if request else None)
    result = await svc.publish_draft(payload.draft_id, payload.draft_type, user.id)
    if result.get("status") == "failed":
        raise HTTPException(status_code=400, detail=result.get("error", "发布失败"))
    return result


@router.post(
    "/metric-automation/rollback",
    summary="回滚 DWS/ADS（X0506/X0508）",
    dependencies=[Depends(require_op("warehouse.metrics", "U"))],
)
async def metric_automation_rollback(
    payload: MetricAutomationRollbackIn,
    db: AsyncSession = Depends(get_session),
):
    """回滚 DWS/ADS 到指定版本。

    权限要求：warehouse.metrics:U
    """
    if not settings.WAREHOUSE_FEATURE_METRIC_AUTOMATION:
        raise HTTPException(status_code=403, detail="指标自动化 feature flag 未开启")
    svc = get_metric_automation_service(db)
    return await svc.rollback_draft(payload.draft_id, payload.draft_type, payload.target_version)


@router.post(
    "/metric-automation/ads-draft",
    summary="生成 ADS 草稿（X0507）",
    dependencies=[Depends(require_op("warehouse.metrics", "U"))],
)
async def metric_automation_generate_ads_draft(
    payload: MetricAutomationAdsDraftIn,
    db: AsyncSession = Depends(get_session),
):
    """从 DWS 聚合/数据集/模型 生成 ADS 消费草稿。

    权限要求：warehouse.metrics:U
    """
    if not settings.WAREHOUSE_FEATURE_METRIC_AUTOMATION:
        raise HTTPException(status_code=403, detail="指标自动化 feature flag 未开启")
    svc = get_metric_automation_service(db)
    result = await svc.generate_ads_draft(payload.source_type, payload.source_id, payload.name, payload.consume_domain)
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    return result


@router.get(
    "/metric-automation/ads-impact/{ads_id}",
    summary="ADS 下游影响分析（X0508）",
    dependencies=[Depends(require_op("warehouse.metrics", "V"))],
)
async def metric_automation_ads_impact(
    ads_id: int,
    db: AsyncSession = Depends(get_session),
):
    """获取 ADS 发布/变更的下游影响分析。

    权限要求：warehouse.metrics:V
    """
    svc = get_metric_automation_service(db)
    return await svc.get_ads_impact(ads_id)


@router.get(
    "/metric-automation/bi-contract/{asset_type}/{asset_id}",
    summary="BI 消费契约（X0509）",
    dependencies=[Depends(require_op("warehouse.metrics", "V"))],
)
async def metric_automation_bi_contract(
    asset_type: str,
    asset_id: int,
    db: AsyncSession = Depends(get_session),
):
    """获取已发布 DWS/ADS View 的 BI 消费说明。

    包括 View 名称、字段说明、权限要求、刷新语义、推荐连接方式。
    权限要求：warehouse.metrics:V
    """
    svc = get_metric_automation_service(db)
    result = await svc.generate_bi_contract(asset_type, asset_id)
    if "error" in result:
        raise HTTPException(status_code=404, detail=result["error"])
    return result


@router.get(
    "/metric-automation/change-plan/{metric_id}",
    summary="指标变更下游更新方案（X0510）",
    dependencies=[Depends(require_op("warehouse.metrics", "V"))],
)
async def metric_automation_change_plan(
    metric_id: int,
    db: AsyncSession = Depends(get_session),
):
    """当指标定义变更时，生成下游 DWS/ADS/BI 影响方案。

    返回受影响的 DWS 聚合、ADS 消费资产列表和推荐处理动作。
    默认不自动执行。
    权限要求：warehouse.metrics:V
    """
    svc = get_metric_automation_service(db)
    return await svc.generate_change_plan(metric_id)


@router.get(
    "/metric-automation/refresh-strategy/{asset_type}/{asset_id}",
    summary="获取刷新策略（X0511）",
    dependencies=[Depends(require_op("warehouse.metrics", "V"))],
)
async def metric_automation_get_refresh(
    asset_type: str,
    asset_id: int,
    db: AsyncSession = Depends(get_session),
):
    """获取资产刷新策略。View 默认实时查询无需刷新。

    权限要求：warehouse.metrics:V
    """
    svc = get_metric_automation_service(db)
    return await svc.get_refresh_strategy(asset_type, asset_id)


@router.put(
    "/metric-automation/refresh-strategy/{asset_type}/{asset_id}",
    summary="设置刷新策略（X0511）",
    dependencies=[Depends(require_op("warehouse.metrics", "U"))],
)
async def metric_automation_set_refresh(
    asset_type: str,
    asset_id: int,
    strategy: str = Query(..., description="view_realtime / manual / scheduled / upstream_trigger"),
    db: AsyncSession = Depends(get_session),
):
    """设置资产刷新策略。

    权限要求：warehouse.metrics:U
    """
    svc = get_metric_automation_service(db)
    result = await svc.set_refresh_strategy(asset_type, asset_id, strategy)
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    return result


@router.post(
    "/metric-automation/refresh/{asset_type}/{asset_id}",
    summary="执行刷新（X0511）",
    dependencies=[Depends(require_op("warehouse.metrics", "U"))],
)
async def metric_automation_refresh(
    asset_type: str,
    asset_id: int,
    trigger_type: str = Query("manual", description="manual / schedule / upstream"),
    db: AsyncSession = Depends(get_session),
):
    """执行资产刷新，记录运行状态，失败保留旧版本。

    权限要求：warehouse.metrics:U
    """
    svc = get_metric_automation_service(db)
    return await svc.refresh_asset(asset_type, asset_id, trigger_type)


@router.get(
    "/metric-automation/refresh-runs/{asset_type}/{asset_id}",
    summary="刷新运行记录（X0511）",
    dependencies=[Depends(require_op("warehouse.metrics", "V"))],
)
async def metric_automation_refresh_runs(
    asset_type: str,
    asset_id: int,
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_session),
):
    """获取资产刷新运行记录。

    权限要求：warehouse.metrics:V
    """
    svc = get_metric_automation_service(db)
    return await svc.get_refresh_runs(asset_type, asset_id, limit)


@router.get(
    "/metric-automation/timeline/{metric_id}",
    summary="指标自动化审计时间线（X0512）",
    dependencies=[Depends(require_op("warehouse.metrics", "V"))],
)
async def metric_automation_timeline(
    metric_id: int,
    db: AsyncSession = Depends(get_session),
):
    """获取指标自动化全链路审计时间线。

    记录解析、草稿生成、预览、门禁、发布、回滚的审计链路。
    权限要求：warehouse.metrics:V
    """
    svc = get_metric_automation_service(db)
    return await svc.get_timeline(metric_id)


# ==================== Z03 L4 全自动级联 ====================

from app.warehouse.schemas import (
    L4AutoApprovalCreate, L4AutoApprovalOut, L4AutoApprovalAction,
    L4CascadeRuleOut, L4CascadeRuleUpdate,
)


@router.post(
    "/l4-auto/approvals",
    summary="创建 L4 全自动试点申请",
    response_model=L4AutoApprovalOut,
    dependencies=[Depends(require_op("warehouse.metrics", "U"))],
)
async def create_l4_approval(
    payload: L4AutoApprovalCreate,
    db: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
):
    """为指标申请 L4 全自动级联试点。系统自动评估风险等级。"""
    from app.core.config import settings
    from app.warehouse.models import L4AutoApproval
    from app.datasets.models import WarehouseMetric

    if not settings.WAREHOUSE_FEATURE_L4_FULL_AUTO:
        raise HTTPException(status_code=403, detail="L4 全自动功能未启用")

    # 检查指标是否存在
    metric = await db.get(WarehouseMetric, payload.metric_id)
    if not metric:
        raise HTTPException(status_code=404, detail=f"指标不存在: {payload.metric_id}")

    # 检查是否已有审批记录
    existing = await db.execute(
        select(L4AutoApproval).where(
            L4AutoApproval.metric_id == payload.metric_id,
            L4AutoApproval.status.in_(["pending", "approved"]),
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="该指标已有审批记录")

    # 风险自动评估
    risk_info = await _assess_l4_risk(payload.metric_id, db)

    approval = L4AutoApproval(
        metric_id=payload.metric_id,
        subject_area=metric.subject_area,
        risk_level=risk_info["risk_level"],
        max_auto_frequency=payload.max_auto_frequency,
        auto_rollback_enabled=payload.auto_rollback_enabled,
        status="pending",
        requested_by=user.login_name if user else None,
        reason=payload.reason,
    )
    db.add(approval)
    await db.commit()
    await db.refresh(approval)

    return L4AutoApprovalOut(
        id=approval.id,
        metric_id=approval.metric_id,
        metric_code=metric.metric_code or "",
        metric_name=metric.metric_name or "",
        subject_area=approval.subject_area,
        risk_level=approval.risk_level,
        max_auto_frequency=approval.max_auto_frequency,
        auto_rollback_enabled=approval.auto_rollback_enabled,
        status=approval.status,
        requested_by=approval.requested_by,
        reason=approval.reason,
        created_at=approval.created_at,
        updated_at=approval.updated_at,
    )


@router.get(
    "/l4-auto/approvals",
    summary="列出 L4 试点审批记录",
    response_model=list[L4AutoApprovalOut],
    dependencies=[Depends(require_op("warehouse.metrics", "V"))],
)
async def list_l4_approvals(
    status: Optional[str] = Query(None, description="pending/approved/rejected/revoked"),
    metric_id: Optional[int] = Query(None),
    db: AsyncSession = Depends(get_session),
):
    """列出 L4 试点审批记录，可按状态或指标筛选。"""
    from app.warehouse.models import L4AutoApproval
    from app.datasets.models import WarehouseMetric

    stmt = select(L4AutoApproval).order_by(L4AutoApproval.created_at.desc())
    if status:
        stmt = stmt.where(L4AutoApproval.status == status)
    if metric_id:
        stmt = stmt.where(L4AutoApproval.metric_id == metric_id)

    approvals = (await db.execute(stmt)).scalars().all()
    out = []
    for a in approvals:
        metric = await db.get(WarehouseMetric, a.metric_id)
        out.append(L4AutoApprovalOut(
            id=a.id, metric_id=a.metric_id,
            metric_code=metric.metric_code if metric else "",
            metric_name=metric.metric_name if metric else "",
            subject_area=a.subject_area, risk_level=a.risk_level,
            max_auto_frequency=a.max_auto_frequency,
            auto_rollback_enabled=a.auto_rollback_enabled,
            status=a.status, requested_by=a.requested_by,
            approved_by=a.approved_by, reason=a.reason,
            created_at=a.created_at, updated_at=a.updated_at,
        ))
    return out


@router.put(
    "/l4-auto/approvals/{approval_id}/approve",
    summary="审批通过 L4 试点申请",
    response_model=L4AutoApprovalOut,
    dependencies=[Depends(require_op("warehouse.metrics", "U"))],
)
async def approve_l4_approval(
    approval_id: int,
    payload: L4AutoApprovalAction = L4AutoApprovalAction(),
    db: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
):
    """管理员审批通过 L4 试点申请。"""
    from app.warehouse.models import L4AutoApproval
    from app.datasets.models import WarehouseMetric

    approval = await db.get(L4AutoApproval, approval_id)
    if not approval:
        raise HTTPException(status_code=404, detail="审批记录不存在")
    if approval.status != "pending":
        raise HTTPException(status_code=409, detail=f"当前状态 {approval.status} 不可审批")

    # 高风险指标不可审批
    if approval.risk_level != "low":
        raise HTTPException(status_code=422, detail=f"仅低风险指标可通过 L4 审批，当前风险等级: {approval.risk_level}")

    approval.status = "approved"
    approval.approved_by = user.login_name if user else None
    approval.reason = (approval.reason or "") + (f" [审批备注: {payload.reason}]" if payload.reason else "")
    await db.commit()
    await db.refresh(approval)

    metric = await db.get(WarehouseMetric, approval.metric_id)
    return L4AutoApprovalOut(
        id=approval.id, metric_id=approval.metric_id,
        metric_code=metric.metric_code if metric else "",
        metric_name=metric.metric_name if metric else "",
        subject_area=approval.subject_area, risk_level=approval.risk_level,
        max_auto_frequency=approval.max_auto_frequency,
        auto_rollback_enabled=approval.auto_rollback_enabled,
        status=approval.status, requested_by=approval.requested_by,
        approved_by=approval.approved_by, reason=approval.reason,
        created_at=approval.created_at, updated_at=approval.updated_at,
    )


@router.put(
    "/l4-auto/approvals/{approval_id}/reject",
    summary="驳回 L4 试点申请",
    response_model=L4AutoApprovalOut,
    dependencies=[Depends(require_op("warehouse.metrics", "U"))],
)
async def reject_l4_approval(
    approval_id: int,
    payload: L4AutoApprovalAction = L4AutoApprovalAction(),
    db: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
):
    """管理员驳回 L4 试点申请。"""
    from app.warehouse.models import L4AutoApproval
    from app.datasets.models import WarehouseMetric

    approval = await db.get(L4AutoApproval, approval_id)
    if not approval:
        raise HTTPException(status_code=404, detail="审批记录不存在")
    if approval.status != "pending":
        raise HTTPException(status_code=409, detail=f"当前状态 {approval.status} 不可驳回")

    approval.status = "rejected"
    approval.approved_by = user.login_name if user else None
    approval.reason = (approval.reason or "") + (f" [驳回原因: {payload.reason}]" if payload.reason else "")
    await db.commit()
    await db.refresh(approval)

    metric = await db.get(WarehouseMetric, approval.metric_id)
    return L4AutoApprovalOut(
        id=approval.id, metric_id=approval.metric_id,
        metric_code=metric.metric_code if metric else "",
        metric_name=metric.metric_name if metric else "",
        subject_area=approval.subject_area, risk_level=approval.risk_level,
        max_auto_frequency=approval.max_auto_frequency,
        auto_rollback_enabled=approval.auto_rollback_enabled,
        status=approval.status, requested_by=approval.requested_by,
        approved_by=approval.approved_by, reason=approval.reason,
        created_at=approval.created_at, updated_at=approval.updated_at,
    )


@router.delete(
    "/l4-auto/approvals/{approval_id}",
    summary="撤销 L4 试点申请",
    dependencies=[Depends(require_op("warehouse.metrics", "U"))],
)
async def revoke_l4_approval(
    approval_id: int,
    db: AsyncSession = Depends(get_session),
):
    """撤销 L4 试点申请。"""
    from app.warehouse.models import L4AutoApproval

    approval = await db.get(L4AutoApproval, approval_id)
    if not approval:
        raise HTTPException(status_code=404, detail="审批记录不存在")

    approval.status = "revoked"
    await db.commit()
    return {"ok": True}


async def _assess_l4_risk(metric_id: int, db: AsyncSession) -> dict:
    """评估指标的 L4 风险等级（统一入口，复用 L4RiskAssessmentService）。"""
    from app.warehouse.service.l4_risk import L4RiskAssessmentService
    svc = L4RiskAssessmentService(db)
    return await svc.assess(metric_id)


# ---- Z0302: L4 级联规则 CRUD ----


@router.get(
    "/l4-auto/rules/{metric_id}",
    summary="获取指标 L4 级联规则",
    response_model=L4CascadeRuleOut,
    dependencies=[Depends(require_op("warehouse.metrics", "V"))],
)
async def get_l4_cascade_rule(
    metric_id: int,
    db: AsyncSession = Depends(get_session),
):
    """获取指标的 L4 全自动级联规则配置。"""
    from app.warehouse.models import L4CascadeRule

    result = await db.execute(
        select(L4CascadeRule).where(L4CascadeRule.metric_id == metric_id)
    )
    rule = result.scalar_one_or_none()
    if not rule:
        return L4CascadeRuleOut(metric_id=metric_id)
    return L4CascadeRuleOut(
        metric_id=rule.metric_id,
        trigger_conditions=rule.trigger_conditions or [],
        risk_strategies=rule.risk_strategies or {},
        max_frequency=rule.max_frequency,
        auto_rollback=rule.auto_rollback,
        notify_on_success=rule.notify_on_success,
        notify_on_block=rule.notify_on_block,
        notify_on_fail=rule.notify_on_fail,
    )


@router.put(
    "/l4-auto/rules/{metric_id}",
    summary="更新指标 L4 级联规则",
    response_model=L4CascadeRuleOut,
    dependencies=[Depends(require_op("warehouse.metrics", "U"))],
)
async def update_l4_cascade_rule(
    metric_id: int,
    payload: L4CascadeRuleUpdate,
    db: AsyncSession = Depends(get_session),
):
    """更新或创建指标的 L4 全自动级联规则。仅已审批的指标可配置。"""
    from app.warehouse.models import L4CascadeRule, L4AutoApproval

    # 校验：仅已审批的指标可配置规则
    approval = (await db.execute(
        select(L4AutoApproval).where(
            L4AutoApproval.metric_id == metric_id,
            L4AutoApproval.status == "approved",
        )
    )).scalar_one_or_none()
    if not approval:
        raise HTTPException(status_code=403, detail="仅已审批的 L4 试点指标可配置级联规则")
    if approval.risk_level != "low":
        raise HTTPException(status_code=422, detail=f"仅低风险指标可配置 L4 级联规则，当前风险等级: {approval.risk_level}")

    result = await db.execute(
        select(L4CascadeRule).where(L4CascadeRule.metric_id == metric_id)
    )
    rule = result.scalar_one_or_none()

    from app.warehouse.service.l4_cascade import L4_ALL_TRIGGERS as ALLOWED_TRIGGERS
    update_data = payload.model_dump(exclude_unset=True)
    tc = update_data.get("trigger_conditions", rule.trigger_conditions if rule else None)
    if tc is not None:
        if not tc:
            raise HTTPException(status_code=422, detail="触发条件不能为空，至少选择一个")
        for t in tc:
            if t not in ALLOWED_TRIGGERS:
                raise HTTPException(status_code=422, detail=f"非法触发条件: {t}，允许值: {ALLOWED_TRIGGERS}")
    if rule is None:
        rule = L4CascadeRule(metric_id=metric_id, **update_data)
        db.add(rule)
    else:
        for key, val in update_data.items():
            setattr(rule, key, val)
    await db.commit()
    await db.refresh(rule)

    return L4CascadeRuleOut(
        metric_id=rule.metric_id,
        trigger_conditions=rule.trigger_conditions or [],
        risk_strategies=rule.risk_strategies or {},
        max_frequency=rule.max_frequency,
        auto_rollback=rule.auto_rollback,
        notify_on_success=rule.notify_on_success,
        notify_on_block=rule.notify_on_block,
        notify_on_fail=rule.notify_on_fail,
    )


# ---- Z0304/Z0305: 紧急停止、回滚、审计 ----


from app.warehouse.service.l4_cascade import is_emergency_stopped as _l4_stopped, set_emergency_stop as _l4_set_stop


@router.get(
    "/l4-auto/status",
    summary="查询 L4 运行状态",
    dependencies=[Depends(require_op("warehouse.metrics", "V"))],
)
async def get_l4_status():
    """返回 L4 全自动级联当前状态。"""
    from app.core.config import settings
    return {
        "emergency_stop": _l4_stopped(),
        "feature_enabled": settings.WAREHOUSE_FEATURE_L4_FULL_AUTO,
    }


@router.post(
    "/l4-auto/emergency-stop",
    summary="紧急停止 L4 全自动",
    dependencies=[Depends(require_op("warehouse.metrics", "U"))],
)
async def l4_emergency_stop(
    reason: Optional[str] = Query(None),
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
):
    """紧急停止所有 L4 全自动级联任务（写入 DB + 更新内存缓存）。"""
    from app.warehouse.models import L4RuntimeControl
    from datetime import UTC, datetime as dt_real

    ctrl = await db.get(L4RuntimeControl, 1)
    if ctrl is None:
        ctrl = L4RuntimeControl(id=1, max_pilot_metrics=5)
        db.add(ctrl)
    ctrl.emergency_stop = True
    ctrl.emergency_stop_reason = reason or "管理员手动紧急停止"
    ctrl.emergency_stop_by = user.login_name if user else "unknown"
    ctrl.emergency_stop_at = dt_real.now(UTC)
    await db.commit()

    _l4_set_stop(True)
    log_msg = f"L4 全自动紧急停止" + (f": {reason}" if reason else "")
    logger.warning(log_msg, extra={"user": user.login_name if user else "unknown"})
    return {"ok": True, "message": log_msg}


@router.post(
    "/l4-auto/resume",
    summary="恢复 L4 全自动",
    dependencies=[Depends(require_op("warehouse.metrics", "U"))],
)
async def l4_resume(
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
):
    """恢复 L4 全自动级联运行（写入 DB + 更新内存缓存）。"""
    from app.warehouse.models import L4RuntimeControl

    ctrl = await db.get(L4RuntimeControl, 1)
    if ctrl:
        ctrl.emergency_stop = False
        await db.commit()
    _l4_set_stop(False)
    return {"ok": True, "message": "L4 全自动已恢复"}


@router.post(
    "/l4-auto/executions/{execution_id}/confirm",
    summary="用户确认 REVIEW_REQUIRED 后继续执行剩余链路",
    dependencies=[Depends(require_op("warehouse.metrics", "U"))],
)
async def l4_confirm_and_continue(
    execution_id: int,
    db: AsyncSession = Depends(get_session),
):
    """REVIEW_REQUIRED 状态：用户确认后，从 pending context 恢复执行剩余链路。"""
    from app.automation.models import AutomationExecution
    from app.warehouse.models import L4PendingExecution
    from app.warehouse.service.l4_cascade import L4CascadeEngine

    exec_rec = await db.get(AutomationExecution, execution_id)
    if not exec_rec:
        raise HTTPException(status_code=404, detail="执行记录不存在")

    # 查找关联的 pending execution
    pending = (await db.execute(
        select(L4PendingExecution).where(
            L4PendingExecution.execution_id == execution_id,
            L4PendingExecution.risk_state == "review_required",
            L4PendingExecution.status == "pending",
        ).order_by(L4PendingExecution.id.desc()).limit(1)
    )).scalar_one_or_none()

    if not pending:
        raise HTTPException(status_code=404, detail="未找到待确认的 L4 pending context")

    exec_rec.status = "running"
    await db.commit()

    engine = L4CascadeEngine(db, trace_id=pending.trace_id or f"l4_confirm_{execution_id}", execution_id=execution_id)
    result = await engine.resume_from_pending(pending.id, "review_required")

    # 更新 execution 最终状态
    result_status = result.get("status", "failed")
    exec_rec.status = "success" if result_status == "success" else result_status
    if result.get("error"):
        exec_rec.error_message = result.get("error", "")[:1000]
    await db.commit()

    return {"ok": True, "execution_id": execution_id, "pending_id": pending.id, "result": result}


@router.post(
    "/l4-auto/executions/{execution_id}/approve-continue",
    summary="管理员审批通过 APPROVAL_REQUIRED 后继续执行",
    dependencies=[Depends(require_op("warehouse.metrics", "U"))],
)
async def l4_approve_and_continue(
    execution_id: int,
    db: AsyncSession = Depends(get_session),
):
    """APPROVAL_REQUIRED 状态：管理员审批通过后，从 pending context 恢复执行剩余链路。"""
    from app.automation.models import AutomationExecution
    from app.warehouse.models import L4PendingExecution
    from app.warehouse.service.l4_cascade import L4CascadeEngine

    exec_rec = await db.get(AutomationExecution, execution_id)
    if not exec_rec:
        raise HTTPException(status_code=404, detail="执行记录不存在")

    pending = (await db.execute(
        select(L4PendingExecution).where(
            L4PendingExecution.execution_id == execution_id,
            L4PendingExecution.risk_state == "approval_required",
            L4PendingExecution.status == "pending",
        ).order_by(L4PendingExecution.id.desc()).limit(1)
    )).scalar_one_or_none()

    if not pending:
        raise HTTPException(status_code=404, detail="未找到待审批的 L4 pending context")

    exec_rec.status = "running"
    await db.commit()

    engine = L4CascadeEngine(db, trace_id=pending.trace_id or f"l4_approve_{execution_id}", execution_id=execution_id)
    result = await engine.resume_from_pending(pending.id, "approval_required")

    # 更新 execution 最终状态
    result_status = result.get("status", "failed")
    exec_rec.status = "success" if result_status == "success" else result_status
    if result.get("error"):
        exec_rec.error_message = result.get("error", "")[:1000]
    await db.commit()

    return {"ok": True, "execution_id": execution_id, "pending_id": pending.id, "result": result}


@router.post(
    "/l4-auto/rollback/{metric_id}",
    summary="一键回滚指标最近一次 L4 自动发布",
    dependencies=[Depends(require_op("warehouse.metrics", "U"))],
)
async def l4_rollback_metric(
    metric_id: int,
    db: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
):
    """回滚指定指标最近一次 L4 自动发布（完整回滚：DWS→ADS→BI契约→审计）。"""
    from app.warehouse.service.l4_rollback import L4RollbackService
    svc = L4RollbackService(db)
    operator = user.login_name if user else "system"
    return await svc.rollback_latest(metric_id, operator=operator)


@router.get(
    "/l4-auto/timeline/{metric_id}",
    summary="L4 全自动审计时间线",
    dependencies=[Depends(require_op("warehouse.metrics", "V"))],
)
async def l4_timeline(
    metric_id: int,
    db: AsyncSession = Depends(get_session),
):
    """获取指标 L4 全自动级联执行时间线（优先从结构化审计表读取）。"""
    from app.warehouse.models import L4AuditStep

    # 从结构化审计表读取所有步骤
    steps_query = (await db.execute(
        select(L4AuditStep).where(
            L4AuditStep.metric_id == metric_id,
        ).order_by(L4AuditStep.created_at.desc(), L4AuditStep.step_order.asc()).limit(100)
    )).scalars().all()

    # 按 trace_id 分组
    events_map: dict[str, dict] = {}
    for s in steps_query:
        tid = s.trace_id
        if tid not in events_map:
            events_map[tid] = {
                "trace_id": tid,
                "execution_id": s.execution_id,
                "metric_id": s.metric_id,
                "started_at": s.started_at.isoformat() if s.started_at else None,
                "finished_at": s.finished_at.isoformat() if s.finished_at else None,
                "steps": [],
            }
        events_map[tid]["steps"].append({
            "step_code": s.step_code,
            "step_name": s.step_name,
            "step_order": s.step_order,
            "status": s.status,
            "risk_level": s.risk_level,
            "error_message": s.error_message,
            "operator": s.operator,
            "started_at": s.started_at.isoformat() if s.started_at else None,
            "finished_at": s.finished_at.isoformat() if s.finished_at else None,
            "input_snapshot": s.input_snapshot,
            "output_snapshot": s.output_snapshot,
        })

    # 补充 automation_executions（用于回滚等操作）
    from app.automation.models import AutomationExecution
    auto_execs = (await db.execute(
        select(AutomationExecution).where(
            AutomationExecution.biz_type == "metric",
            AutomationExecution.biz_id == str(metric_id),
        ).order_by(AutomationExecution.started_at.desc()).limit(20)
    )).scalars().all()

    exec_events = []
    for ae in auto_execs:
        exec_events.append({
            "execution_id": ae.id,
            "trigger_type": ae.trigger_type,
            "status": ae.status,
            "started_at": ae.started_at.isoformat() if ae.started_at else None,
            "finished_at": ae.finished_at.isoformat() if ae.finished_at else None,
        })

    return {
        "metric_id": metric_id,
        "events": list(events_map.values()),
        "executions": exec_events,
        "summary": {"total_events": len(events_map), "total_steps": len(steps_query)},
    }


@router.get(
    "/l4-auto/summary",
    summary="L4 全自动运行摘要（最近 24h）",
    dependencies=[Depends(require_op("warehouse.metrics", "V"))],
)
async def l4_summary(
    db: AsyncSession = Depends(get_session),
):
    """返回最近 24h L4 全自动级联运行摘要。"""
    from datetime import timedelta, UTC, datetime as dt
    from app.automation.models import AutomationExecution

    since = dt.now(UTC) - timedelta(hours=24)
    from app.warehouse.service.l4_cascade import L4_ALL_TRIGGERS
    rows = (await db.execute(
        select(AutomationExecution.status, func.count().label("cnt")).where(
            AutomationExecution.trigger_type.in_(L4_ALL_TRIGGERS),
            AutomationExecution.started_at >= since,
        ).group_by(AutomationExecution.status)
    )).all()

    stats = {row.status: row.cnt for row in rows}
    total = sum(stats.values())

    return {
        "total": total,
        "success": stats.get("success", 0),
        "blocked": stats.get("review_required", 0) + stats.get("approval_required", 0),
        "failed": stats.get("failed", 0),
        "skipped": stats.get("skipped", 0),
        "emergency_stopped": _l4_stopped(),
        "period_hours": 24,
    }


@router.get(
    "/l4-auto/executions",
    summary="L4 运行记录列表（分页）",
    dependencies=[Depends(require_op("warehouse.metrics", "V"))],
)
async def l4_executions_list(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status: Optional[str] = Query(None, description="success/partial_failed/failed/review_required"),
    trigger_type: Optional[str] = Query(None),
    metric_id: Optional[int] = Query(None),
    db: AsyncSession = Depends(get_session),
):
    """L4 运行记录分页列表，支持按状态/触发方式/指标筛选。"""
    from datetime import timedelta, UTC, datetime as dt_real
    from app.automation.models import AutomationExecution, AutomationActionExecution
    from app.warehouse.service.l4_cascade import L4_ALL_TRIGGERS

    stmt = select(AutomationExecution).where(
        AutomationExecution.trigger_type.in_(L4_ALL_TRIGGERS),
    )
    if status:
        stmt = stmt.where(AutomationExecution.status == status)
    if trigger_type:
        stmt = stmt.where(AutomationExecution.trigger_type == trigger_type)
    if metric_id:
        stmt = stmt.where(AutomationExecution.biz_id == str(metric_id))

    total = (await db.execute(select(func.count()).select_from(stmt.subquery()))).scalar() or 0
    execs = (await db.execute(
        stmt.order_by(AutomationExecution.started_at.desc())
        .offset((page - 1) * page_size).limit(page_size)
    )).scalars().all()

    items = []
    for e in execs:
        # 取第一个 action 的 output 摘要
        action = (await db.execute(
            select(AutomationActionExecution).where(
                AutomationActionExecution.execution_id == e.id,
            ).order_by(AutomationActionExecution.action_index).limit(1)
        )).scalar_one_or_none()
        output_summary = (action.output_snapshot or {}).get("status", "") if action else ""
        items.append({
            "execution_id": e.id,
            "trigger_type": e.trigger_type,
            "biz_id": e.biz_id,
            "status": e.status,
            "started_at": e.started_at.isoformat() if e.started_at else None,
            "finished_at": e.finished_at.isoformat() if e.finished_at else None,
            "error_message": e.error_message,
            "output_summary": output_summary,
        })

    return {"items": items, "total": total, "page": page, "page_size": page_size}


# ==================== R04 快照管理 ====================

from app.warehouse.service import get_snapshot_service


@router.get("/snapshots", summary="快照任务列表", dependencies=[Depends(require_op("warehouse.modeling", "V"))])
async def list_snapshots(page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=200), db: AsyncSession = Depends(get_session)):
    return await get_snapshot_service(db).list_jobs(page=page, page_size=page_size)


@router.post("/snapshots", summary="创建快照任务", status_code=201, dependencies=[Depends(require_op("warehouse.modeling", "C"))])
async def create_snapshot(payload: SnapshotJobIn, db: AsyncSession = Depends(get_session)):
    return await get_snapshot_service(db).create_job(payload.model_dump())


@router.patch("/snapshots/{job_id}", summary="更新快照任务", dependencies=[Depends(require_op("warehouse.modeling", "U"))])
async def update_snapshot(job_id: int, payload: SnapshotJobUpdateIn, db: AsyncSession = Depends(get_session)):
    result = await get_snapshot_service(db).update_job(job_id, payload.model_dump(exclude_none=True))
    if result is None: raise HTTPException(status_code=404, detail=f"快照任务不存在: {job_id}")
    return result


@router.delete("/snapshots/{job_id}", summary="删除快照任务", status_code=204, dependencies=[Depends(require_op("warehouse.modeling", "D"))])
async def delete_snapshot(job_id: int, db: AsyncSession = Depends(get_session)):
    ok = await get_snapshot_service(db).delete_job(job_id)
    if not ok: raise HTTPException(status_code=404, detail=f"快照任务不存在: {job_id}")


@router.post("/snapshots/{job_id}/trigger", summary="手动触发快照", status_code=201, dependencies=[Depends(require_op("warehouse.modeling", "U"))])
async def trigger_snapshot(job_id: int, payload: SnapshotTriggerIn, db: AsyncSession = Depends(get_session)):
    result = await get_snapshot_service(db).trigger_snapshot(job_id, payload.period_value)
    if "error" in result: raise HTTPException(status_code=404, detail="快照任务不存在")
    return result


@router.get("/snapshots/runs", summary="快照运行记录", dependencies=[Depends(require_op("warehouse.modeling", "V"))])
async def list_snapshot_runs(job_id: int = Query(None), page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=200), db: AsyncSession = Depends(get_session)):
    return await get_snapshot_service(db).list_runs(job_id=job_id, page=page, page_size=page_size)


# ==================== SCD 拉链 (R0403) ====================

from app.warehouse.service import get_scd_service


@router.get("/scd-configs", summary="SCD 配置列表", dependencies=[Depends(require_op("warehouse.modeling", "V"))])
async def list_scd_configs(page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=200), db: AsyncSession = Depends(get_session)):
    return await get_scd_service(db).list_configs(page=page, page_size=page_size)


@router.post("/scd-configs", summary="创建 SCD 配置", status_code=201, dependencies=[Depends(require_op("warehouse.modeling", "C"))])
async def create_scd_config(payload: ScdConfigIn, db: AsyncSession = Depends(get_session)):
    return await get_scd_service(db).create_config(payload.model_dump())


@router.patch("/scd-configs/{config_id}", summary="更新 SCD 配置", dependencies=[Depends(require_op("warehouse.modeling", "U"))])
async def update_scd_config(config_id: int, payload: ScdConfigUpdateIn, db: AsyncSession = Depends(get_session)):
    result = await get_scd_service(db).update_config(config_id, payload.model_dump(exclude_none=True))
    if result is None: raise HTTPException(status_code=404, detail="SCD 配置不存在")
    return result


@router.delete("/scd-configs/{config_id}", summary="删除 SCD 配置", status_code=204, dependencies=[Depends(require_op("warehouse.modeling", "D"))])
async def delete_scd_config(config_id: int, db: AsyncSession = Depends(get_session)):
    ok = await get_scd_service(db).delete_config(config_id)
    if not ok: raise HTTPException(status_code=404, detail="SCD 配置不存在")


@router.post("/scd-configs/{config_id}/execute", summary="执行 SCD 拉链", dependencies=[Depends(require_op("warehouse.modeling", "U"))])
async def execute_scd(config_id: int, db: AsyncSession = Depends(get_session)):
    result = await get_scd_service(db).execute_scd(config_id)
    if "error" in result: raise HTTPException(status_code=400, detail=result.get("detail", result["error"]))
    return result


@router.get("/scd-runs", summary="SCD 执行记录", dependencies=[Depends(require_op("warehouse.modeling", "V"))])
async def list_scd_runs(config_id: int = Query(None), page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=200), db: AsyncSession = Depends(get_session)):
    return await get_scd_service(db).list_runs(config_id=config_id, page=page, page_size=page_size)


@router.get("/scd-detect-candidates", summary="检测表 SCD 候选字段", dependencies=[Depends(require_op("warehouse.modeling", "V"))])
async def detect_scd_candidates(table_name: str = Query(...), db: AsyncSession = Depends(get_session)):
    return await get_scd_service(db).detect_candidates(table_name)


# ==================== ADS 组装与发布 (R0702 + R0704) ====================

from app.warehouse.service import get_ads_service


@router.get("/ads-definitions", summary="ADS 定义列表", dependencies=[Depends(require_op("warehouse.service", "V"))])
async def list_ads_definitions(page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=200), status: str = Query(None), db: AsyncSession = Depends(get_session)):
    return await get_ads_service(db).list_definitions(page=page, page_size=page_size, status=status)


@router.post("/ads-definitions", summary="创建 ADS 定义", status_code=201, dependencies=[Depends(require_op("warehouse.service", "C"))])
async def create_ads_definition(payload: AdsDefinitionIn, db: AsyncSession = Depends(get_session)):
    svc = get_ads_service(db)
    data = payload.model_dump()
    validate_result = await svc.validate(data)
    if not validate_result["valid"]:
        raise HTTPException(status_code=400, detail={"validation_errors": validate_result["errors"]})
    return await svc.create_definition(data)


@router.get("/ads-definitions/{def_id}", summary="ADS 定义详情", dependencies=[Depends(require_op("warehouse.service", "V"))])
async def get_ads_definition(def_id: int, db: AsyncSession = Depends(get_session)):
    result = await get_ads_service(db).get_definition(def_id)
    if result is None: raise HTTPException(status_code=404, detail="ADS 定义不存在")
    return result


@router.patch("/ads-definitions/{def_id}", summary="更新 ADS 定义", dependencies=[Depends(require_op("warehouse.service", "U"))])
async def update_ads_definition(def_id: int, payload: AdsDefinitionUpdateIn, db: AsyncSession = Depends(get_session)):
    result = await get_ads_service(db).update_definition(def_id, payload.model_dump(exclude_none=True))
    if result is None: raise HTTPException(status_code=404, detail="ADS 定义不存在")
    return result


@router.delete("/ads-definitions/{def_id}", summary="删除 ADS 定义", status_code=204, dependencies=[Depends(require_op("warehouse.service", "D"))])
async def delete_ads_definition(def_id: int, db: AsyncSession = Depends(get_session)):
    ok = await get_ads_service(db).delete_definition(def_id)
    if not ok: raise HTTPException(status_code=404, detail="ADS 定义不存在")


@router.get("/ads-definitions/{def_id}/preview", summary="预览 ADS 组装结果", dependencies=[Depends(require_op("warehouse.service", "V"))])
async def preview_ads(def_id: int, db: AsyncSession = Depends(get_session)):
    result = await get_ads_service(db).preview(def_id)
    if "error" in result: raise HTTPException(status_code=404, detail="ADS 定义不存在")
    return result


@router.post("/ads-definitions/validate", summary="校验 ADS 配置", dependencies=[Depends(require_op("warehouse.service", "U"))])
async def validate_ads_definition(payload: AdsDefinitionIn, db: AsyncSession = Depends(get_session)):
    return await get_ads_service(db).validate(payload.model_dump())


@router.post("/ads-definitions/{def_id}/publish", summary="发布 ADS 为消费资产", dependencies=[Depends(require_op("warehouse.service", "U"))])
async def publish_ads(def_id: int, targets: list[str] = Query(...), db: AsyncSession = Depends(get_session)):
    result = await get_ads_service(db).publish(def_id, targets)
    if "error" in result:
        code = 404 if result["error"] == "not_found" else 400
        raise HTTPException(status_code=code, detail=result.get("detail", result["error"]))
    return result


@router.post("/ads-definitions/{def_id}/unpublish", summary="撤回 ADS 发布", dependencies=[Depends(require_op("warehouse.service", "U"))])
async def unpublish_ads(def_id: int, db: AsyncSession = Depends(get_session)):
    result = await get_ads_service(db).unpublish(def_id)
    if "error" in result:
        raise HTTPException(status_code=400, detail=result.get("detail", result["error"]))
    return result


@router.get("/ads-sources", summary="可用的 DWS 来源列表", dependencies=[Depends(require_op("warehouse.modeling", "V"))])
async def list_ads_sources(db: AsyncSession = Depends(get_session)):
    return await get_ads_service(db).list_sources()


@router.get("/ads-available-dimensions", summary="可用维度列表（ADS 组装参考）", dependencies=[Depends(require_op("warehouse.modeling", "V"))])
async def list_ads_dimensions(db: AsyncSession = Depends(get_session)):
    return await get_ads_service(db).list_dimensions()
