"""Mapping 公共 API

公共 API 不取代所有调用方 CRUD。
数据清洗标准化规则、ODS→DWD 自动化配置、流程节点、UCP 和 PushTarget API 保持兼容。
"""

from __future__ import annotations

from datetime import datetime, timezone
import hashlib
import json
from uuid import uuid4
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from app.core.db import get_session
from app.core.deps import current_user, user_has_op
from pydantic import BaseModel, Field
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.mapping.dto import MappingDocumentV1
from app.mapping.errors import MappingException, MappingErrorCode
from app.mapping.executor import MappingExecutor
from app.mapping.validator import MappingValidator
from app.mapping.policy import (
    CALLER_PERMISSION_SCOPE,
    MappingCallerPolicyV1,
    build_policy,
)
from app.mapping.models import MappingBinding
from app.mapping.service import MappingService
from app.data.models import RegisteredTable, TableColumn
from app.permissions.masker import get_hidden_columns, get_sensitive_columns
from app.users.models import User

router = APIRouter(prefix="/data-mappings", tags=["数据映射"])

# -- 请求/响应模型 ----------------------------------------------------------


class MappingContextRequest(BaseModel):
    model_config = {"extra": "forbid"}

    caller: str = "warehouse"
    sourceAssetId: Optional[str] = None
    targetAssetId: Optional[str] = None


class ValidateRequest(MappingContextRequest):
    document: dict[str, Any]


class ValidateResponse(BaseModel):
    valid: bool
    warnings: list[str] = Field(default_factory=list)


class PreviewRequest(MappingContextRequest):
    document: dict[str, Any]
    rows: list[dict[str, Any]] = Field(default_factory=list)
    reference_snapshot: Optional[dict[str, Any]] = None


class PreviewResponse(BaseModel):
    outputRows: list[dict[str, Any]] = Field(default_factory=list)
    trace: list[dict[str, Any]] = Field(default_factory=list)
    stats: dict[str, Any] = Field(default_factory=dict)
    errors: list[dict[str, Any]] = Field(default_factory=list)


class DatasetInfo(BaseModel):
    id: str
    name: str
    fields: list[dict[str, Any]] = Field(default_factory=list)


class PublishRequest(BaseModel):
    model_config = {"extra": "forbid"}
    expectedVersion: int
    caller: str
    actor: Optional[str] = None


class RebuildRequest(BaseModel):
    model_config = {"extra": "forbid"}
    caller: str
    target_type: Optional[str] = None
    target_id: Optional[str] = None


class WageRolloutRequest(BaseModel):
    model_config = {"extra": "forbid"}
    expected_version: int = Field(0, ge=0)
    mode: str = Field("shadow")
    component_percent: int = Field(0, ge=0, le=100)
    actor: Optional[str] = None


# -- 端点 --------------------------------------------------------------------


@router.post("/policy")
async def resolve_mapping_policy(
    payload: MappingContextRequest,
    db: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
):
    """按 caller 和资产上下文返回服务端可信字段目录、Schema hash 与 effects。"""
    try:
        policy = await _build_server_policy(payload, None, user, db)
        return policy.to_dict()
    except MappingException as exc:
        raise HTTPException(status_code=exc.http_status, detail=exc.to_dict()) from exc


@router.post("/validate")
async def validate_mapping(
    payload: ValidateRequest,
    db: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
):
    """使用服务端字段目录和当前身份校验公共 DTO。"""
    try:
        doc = MappingDocumentV1.from_dict(payload.document)
        policy = await _build_server_policy(payload, doc, user, db)
        await _require_scope(user, db, payload.caller, "V")
        validator = MappingValidator()
        warnings = validator.validate(doc, policy)
        return {"valid": True, "warnings": warnings}
    except MappingException as e:
        raise HTTPException(status_code=e.http_status, detail=e.to_dict())
    except (ValueError, KeyError) as e:
        raise HTTPException(status_code=422, detail=str(e))


@router.post("/preview")
async def preview_mapping(
    payload: PreviewRequest,
    db: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
):
    """使用服务端签发 policy 预览执行。"""
    try:
        doc = MappingDocumentV1.from_dict(payload.document)
        policy = await _build_server_policy(payload, doc, user, db)
        await _require_scope(user, db, payload.caller, "V")
        if not policy.effects.allowPreview:
            raise MappingException(
                MappingErrorCode.MAPPING_EFFECT_FORBIDDEN,
                "当前身份不允许预览映射",
                http_status=403,
            )
        validator = MappingValidator()
        validator.validate(doc, policy)

        executor = MappingExecutor()
        result = await executor.preview(doc, payload.rows, payload.reference_snapshot, policy)

        return {
            "outputRows": result.outputRows,
            "trace": [
                {
                    "rowIndex": t.rowIndex,
                    "ruleId": t.ruleId,
                    "outcome": t.outcome,
                    "referenceKey": t.referenceKey,
                    "before": t.before,
                    "after": t.after,
                    "errorCode": t.errorCode,
                }
                for t in result.trace
            ],
            "stats": {
                "input": result.stats.input,
                "output": result.stats.output,
                "matched": result.stats.matched,
                "unmatched": result.stats.unmatched,
                "errors": result.stats.errors,
            },
            "errors": [
                {
                    "code": e.code,
                    "message": e.message,
                    "rowIndex": e.rowIndex,
                    "ruleId": e.ruleId,
                    "field": e.field,
                }
                for e in result.errors
            ],
        }
    except MappingException as e:
        raise HTTPException(status_code=e.http_status, detail=e.to_dict())
    except (ValueError, KeyError) as e:
        raise HTTPException(status_code=422, detail=str(e))


@router.get("/datasets")
async def list_datasets(
    db: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
):
    """按当前身份返回已发布参考数据集和可见字段目录。"""
    await _require_scope(user, db, "warehouse", "V")
    result = await db.execute(
        select(RegisteredTable)
        .where(RegisteredTable.asset_status == "published")
        .order_by(RegisteredTable.display_order, RegisteredTable.table_name)
    )
    datasets: list[dict[str, Any]] = []
    for dataset in result.scalars().all():
        hidden_fields = await get_hidden_columns(user, dataset.table_name, db)
        sensitive_fields = await get_sensitive_columns(user, dataset.table_name, db)
        field_result = await db.execute(
            select(TableColumn)
            .where(TableColumn.table_name == dataset.table_name)
            .order_by(TableColumn.display_order, TableColumn.column_code)
        )
        fields = [
            {
                "id": column.column_code,
                "name": column.column_label,
                "type": column.data_type,
                "sensitive": (
                    column.is_sensitive
                    or column.column_code in sensitive_fields
                ),
            }
            for column in field_result.scalars().all()
            if column.is_visible and column.column_code not in hidden_fields
        ]
        if fields:
            datasets.append(
                {
                    "id": dataset.table_name,
                    "name": dataset.table_label,
                    "fields": fields,
                }
            )
    return {"datasets": datasets}


@router.get("/wage-rollout/{asset_id}")
async def get_wage_rollout(
    asset_id: str,
    db: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
):
    """读取工资 DWD rollout；未配置时返回安全默认 shadow。"""
    await _require_scope(user, db, "warehouse", "V")
    return await MappingService(db).get_wage_rollout(asset_id=asset_id)


@router.put("/wage-rollout/{asset_id}")
async def configure_wage_rollout(
    asset_id: str,
    payload: WageRolloutRequest,
    db: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
):
    """持久化工资 shadow/gray/rollback 开关并写审计。"""
    await _require_scope(user, db, "warehouse", "U")
    try:
        result = await MappingService(db).configure_wage_rollout(
            asset_id=asset_id,
            expected_version=payload.expected_version,
            mode=payload.mode,
            component_percent=payload.component_percent,
            actor=payload.actor or "system",
        )
        await db.commit()
        return result
    except MappingException as exc:
        await db.rollback()
        raise HTTPException(status_code=exc.http_status, detail=exc.to_dict()) from exc


@router.get("/dependencies/{binding_id}")
async def get_dependencies(
    binding_id: int,
    db: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
):
    """获取绑定的依赖"""
    binding = await _authorize_binding_effect(
        db, user, binding_id=binding_id, caller=None, effect="view", operation="V"
    )
    svc = MappingService(db)
    deps = await svc.get_dependencies(binding_id)
    return {"dependencies": deps}


@router.post("/bindings/{id}/publish")
async def publish_binding(
    id: int,
    payload: PublishRequest,
    db: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
):
    """发布规则集绑定；caller 归属和权限均由服务端复核。"""
    svc = MappingService(db)
    try:
        await _authorize_binding_effect(
            db, user, binding_id=id, caller=payload.caller, effect="publish", operation="U"
        )
        result = await svc.publish(
            binding_id=id,
            expected_version=payload.expectedVersion,
            actor=payload.actor or str(getattr(user, "username", None) or getattr(user, "id", None) or "system"),
        )
        await db.commit()
        from app.core.db import get_session_factory
        from app.ucp.event_bus import process_event_pipeline, receive_event, start_pending_event_deliveries
        async with get_session_factory()() as event_db:
            event = await receive_event(
                event_db,
                event_id=result["event_id"],
                event_type="mapping_rule_set_published",
                source="INTERNAL",
                payload={
                    "event_id": result["event_id"],
                    "binding_id": id,
                    "mapping_version": result["version"],
                    "caller": payload.caller,
                },
            )
            await process_event_pipeline(event_db, event)
            await event_db.commit()
            await start_pending_event_deliveries(event.id)
        return result
    except MappingException as e:
        await db.rollback()
        raise HTTPException(status_code=e.http_status, detail=e.to_dict()) from e
    except Exception:
        await db.rollback()
        raise


@router.post("/bindings/{id}/rebuild-dependencies")
async def rebuild_dependencies(
    id: int,
    payload: RebuildRequest,
    db: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
):
    """触发依赖重算；caller 归属和权限均由服务端复核。"""
    svc = MappingService(db)
    try:
        await _authorize_binding_effect(
            db, user, binding_id=id, caller=payload.caller, effect="rebuild", operation="U"
        )
        result = await svc.rebuild_dependencies(
            binding_id=id,
            target_type=payload.target_type,
            target_id=payload.target_id,
        )
        await db.commit()
        return result
    except MappingException as e:
        await db.rollback()
        raise HTTPException(status_code=e.http_status, detail=e.to_dict()) from e
    except Exception:
        await db.rollback()
        raise


# -- 辅助 --------------------------------------------------------------------


async def _require_scope(
    user: User,
    db: AsyncSession,
    caller: str,
    operation: str,
) -> None:
    permission_scope = CALLER_PERMISSION_SCOPE.get(caller)
    if not permission_scope:
        raise MappingException(
            MappingErrorCode.MAPPING_EFFECT_FORBIDDEN,
            f"不支持的 Mapping caller: {caller}",
            http_status=422,
        )
    if not await user_has_op(user, db, permission_scope, operation):
        raise MappingException(
            MappingErrorCode.MAPPING_EFFECT_FORBIDDEN,
            f"当前身份无权执行 {operation} {caller} Mapping",
            http_status=403,
        )


async def _authorize_binding_effect(
    db: AsyncSession,
    user: User,
    *,
    binding_id: int,
    caller: str | None,
    effect: str,
    operation: str = "U",
) -> MappingBinding:
    result = await db.execute(
        select(MappingBinding).where(MappingBinding.id == binding_id)
    )
    binding = result.scalar_one_or_none()
    if binding is None:
        raise MappingException(
            MappingErrorCode.MAPPING_VERSION_CONFLICT,
            f"绑定 {binding_id} 不存在",
            http_status=404,
        )
    effective_caller = caller or binding.caller
    if caller is not None and binding.caller != caller:
        raise MappingException(
            MappingErrorCode.MAPPING_EFFECT_FORBIDDEN,
            "Mapping caller 与绑定归属不一致",
            http_status=403,
        )
    await _require_scope(user, db, effective_caller, operation)
    return binding


async def _asset_fields(
    db: AsyncSession, asset_id: str | None
) -> tuple[list[str], list[str], list[str], str]:
    if not asset_id:
        return [], [], [], ""
    result = await db.execute(
        select(TableColumn)
        .where(TableColumn.table_name == asset_id)
        .order_by(TableColumn.column_code)
    )
    columns = result.scalars().all()
    schema_payload = [
        {
            "code": column.column_code,
            "type": column.data_type,
            "pk": bool(column.is_pk_part),
            "sensitive": bool(column.is_sensitive),
            "computed": bool(column.is_computed),
        }
        for column in columns
    ]
    schema_hash = hashlib.sha256(
        json.dumps(
            schema_payload,
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
        ).encode("utf-8")
    ).hexdigest()
    return (
        [column.column_code for column in columns],
        [column.column_code for column in columns if column.is_sensitive],
        [column.column_code for column in columns if column.is_pk_part],
        schema_hash,
    )


async def _reference_catalog(
    db: AsyncSession,
    user: User,
) -> tuple[list[str], list[str]]:
    result = await db.execute(
        select(RegisteredTable).where(RegisteredTable.asset_status == "published")
    )
    dataset_ids: list[str] = []
    visible_fields: set[str] = set()
    for dataset in result.scalars().all():
        hidden_fields = await get_hidden_columns(user, dataset.table_name, db)
        field_result = await db.execute(
            select(TableColumn.column_code).where(
                TableColumn.table_name == dataset.table_name,
                TableColumn.is_visible.is_(True),
            )
        )
        fields = {row[0] for row in field_result.all()} - hidden_fields
        if fields:
            dataset_ids.append(dataset.table_name)
            visible_fields.update(fields)
    return dataset_ids, sorted(visible_fields)


async def _build_server_policy(
    payload: MappingContextRequest,
    document: MappingDocumentV1 | None,
    user: User,
    db: AsyncSession,
) -> MappingCallerPolicyV1:
    """只接受 caller/asset 上下文，权限白名单由服务端元数据签发。"""
    source_asset = payload.sourceAssetId or (
        document.ruleSet.sourceAsset if document is not None else None
    )
    target_asset = payload.targetAssetId or (
        document.ruleSet.targetAsset if document is not None else None
    )
    source_fields, source_sensitive, _, source_schema_hash = await _asset_fields(
        db, source_asset
    )
    target_fields, target_sensitive, protected_keys, target_schema_hash = (
        await _asset_fields(db, target_asset)
    )
    if source_asset:
        source_sensitive = sorted(
            set(source_sensitive) | await get_sensitive_columns(user, source_asset, db)
        )
    if target_asset:
        target_sensitive = sorted(
            set(target_sensitive) | await get_sensitive_columns(user, target_asset, db)
        )
    reference_datasets, reference_fields = await _reference_catalog(db, user)
    permission_scope = CALLER_PERMISSION_SCOPE.get(payload.caller)
    if not permission_scope:
        raise MappingException(
            MappingErrorCode.MAPPING_EFFECT_FORBIDDEN,
            f"不支持的 Mapping caller: {payload.caller}",
            http_status=422,
        )
    can_view = await user_has_op(user, db, permission_scope, "V")
    if not can_view:
        raise MappingException(
            MappingErrorCode.MAPPING_EFFECT_FORBIDDEN,
            f"当前身份无权访问 {payload.caller} Mapping",
            http_status=403,
        )
    can_update = await user_has_op(user, db, permission_scope, "U")
    return build_policy(
        caller=payload.caller,
        source_asset_id=source_asset,
        source_schema_hash=source_schema_hash,
        source_field_ids=source_fields,
        source_sensitive_field_ids=source_sensitive,
        target_asset_id=target_asset,
        target_schema_hash=target_schema_hash,
        target_field_ids=target_fields,
        target_protected_keys=protected_keys,
        target_sensitive_field_ids=target_sensitive,
        allowed_reference_datasets=reference_datasets,
        allowed_reference_fields=reference_fields,
        allow_preview=can_view,
        allow_save=can_update,
        allow_publish=can_update,
        allow_execute=can_update,
        allow_rebuild=can_update,
    )
