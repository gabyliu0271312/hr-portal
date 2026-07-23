"""Shared data-object CRUD for UCP connector resources.

The connection owns credentials; each object owns the table/report-specific settings.
"""
from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.connectors.catalog import get_connector_type
from app.ucp.models import UcpResource, UcpResourceDataObject
from app.ucp.system_service import resolve_resource_connector_type


class ResourceDataObjectError(ValueError):
    """Raised when a resource data object does not match its connection type."""


def _as_dict(value: Any, field_name: str) -> dict[str, Any]:
    if value is None:
        return {}
    if not isinstance(value, dict):
        raise ResourceDataObjectError(f"{field_name} 必须是对象")
    return value


def _validate_object_config(connector_type: str, config: dict[str, Any]) -> None:
    requirements = {
        "feishu_sheet": ("source_url 或 spreadsheet_token", lambda c: c.get("source_url") or c.get("spreadsheet_token")),
        "feishu_bitable": ("app_token", lambda c: c.get("app_token")),
        "beisen_report": ("report_id", lambda c: c.get("report_id")),
    }
    requirement = requirements.get(connector_type)
    if requirement and not requirement[1](config):
        raise ResourceDataObjectError(f"数据对象缺少 {requirement[0]}")
    if connector_type == "beisen_report":
        unsupported = {"data_url", "header_url", "token_url", "method", "body_template"} & set(config)
        if unsupported:
            raise ResourceDataObjectError("北森报表对象仅填写 Report ID；接口地址由连接器统一管理")


async def _get_data_object_resource(db: AsyncSession, resource_id: int) -> UcpResource:
    resource = await db.get(UcpResource, resource_id)
    if not resource:
        raise ResourceDataObjectError("资源不存在")
    connector_type = resolve_resource_connector_type(resource)
    connector = get_connector_type(connector_type or "", include_internal=True)
    if not connector or connector.get("connection_kind") != "DATA_OBJECT":
        raise ResourceDataObjectError("该资源不是可配置数据对象的接入类型")
    return resource


def serialize_resource_data_object(item: UcpResourceDataObject) -> dict[str, Any]:
    return {
        "id": item.id,
        "resource_id": item.resource_id,
        "connector_type": item.connector_type,
        "object_code": item.object_code,
        "object_name": item.object_name,
        "object_config": item.object_config or {},
        "field_mapping": item.field_mapping or {},
        "incremental_config": item.incremental_config or {},
        "is_active": bool(item.is_active),
        "created_by": item.created_by,
        "updated_by": item.updated_by,
        "created_at": item.created_at,
        "updated_at": item.updated_at,
    }


async def list_resource_data_objects(
    db: AsyncSession, resource_id: int, *, is_active: bool | None = None
) -> list[UcpResourceDataObject]:
    await _get_data_object_resource(db, resource_id)
    stmt = select(UcpResourceDataObject).where(UcpResourceDataObject.resource_id == resource_id)
    if is_active is not None:
        stmt = stmt.where(UcpResourceDataObject.is_active == int(is_active))
    result = await db.execute(stmt.order_by(UcpResourceDataObject.object_code))
    return list(result.scalars().all())


async def create_resource_data_object(
    db: AsyncSession, resource_id: int, payload: dict[str, Any], *, created_by: str | None
) -> UcpResourceDataObject:
    resource = await _get_data_object_resource(db, resource_id)
    connector_type = resolve_resource_connector_type(resource)
    object_code = str(payload.get("object_code") or "").strip()
    object_name = str(payload.get("object_name") or "").strip()
    if not object_code or not object_name:
        raise ResourceDataObjectError("数据对象编码和名称不能为空")
    config = _as_dict(payload.get("object_config"), "object_config")
    _validate_object_config(connector_type or "", config)
    item = UcpResourceDataObject(
        resource_id=resource_id,
        connector_type=connector_type or "",
        object_code=object_code,
        object_name=object_name,
        object_config=config,
        field_mapping=_as_dict(payload.get("field_mapping"), "field_mapping"),
        incremental_config=_as_dict(payload.get("incremental_config"), "incremental_config"),
        is_active=int(payload.get("is_active", True)),
        created_by=created_by,
        updated_by=created_by,
    )
    db.add(item)
    try:
        await db.commit()
    except Exception:
        await db.rollback()
        raise
    await db.refresh(item)
    return item


async def update_resource_data_object(
    db: AsyncSession,
    resource_id: int,
    object_id: int,
    payload: dict[str, Any],
    *,
    updated_by: str | None,
) -> UcpResourceDataObject:
    resource = await _get_data_object_resource(db, resource_id)
    item = await db.get(UcpResourceDataObject, object_id)
    if not item or item.resource_id != resource_id:
        raise ResourceDataObjectError("数据对象不存在")
    connector_type = resolve_resource_connector_type(resource) or ""
    if item.connector_type != connector_type:
        raise ResourceDataObjectError("资源接入类型已变化，请重新创建数据对象")
    if "object_config" in payload:
        config = _as_dict(payload["object_config"], "object_config")
        _validate_object_config(connector_type, config)
        item.object_config = config
    for key in ("object_code", "object_name"):
        if key in payload:
            value = str(payload[key] or "").strip()
            if not value:
                raise ResourceDataObjectError("数据对象编码和名称不能为空")
            setattr(item, key, value)
    for key in ("field_mapping", "incremental_config"):
        if key in payload:
            setattr(item, key, _as_dict(payload[key], key))
    if "is_active" in payload:
        item.is_active = int(bool(payload["is_active"]))
    item.updated_by = updated_by
    try:
        await db.commit()
    except Exception:
        await db.rollback()
        raise
    await db.refresh(item)
    return item


async def delete_resource_data_object(db: AsyncSession, resource_id: int, object_id: int) -> None:
    await _get_data_object_resource(db, resource_id)
    item = await db.get(UcpResourceDataObject, object_id)
    if not item or item.resource_id != resource_id:
        raise ResourceDataObjectError("数据对象不存在")
    await db.delete(item)
    await db.commit()
