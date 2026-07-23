"""Services for reusable Feishu Bitable table configurations."""
from __future__ import annotations

import re
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ucp.models import UcpBitableTableConfig, UcpResource

BITABLE_ADAPTER_CODE = "FEISHU_BITABLE_PULL_ADAPTER"
_OBJECT_CODE_RE = re.compile(r"^[A-Z][A-Z0-9_]{2,63}$")


class BitableTableConfigError(ValueError):
    pass


def _require_text(value: Any, field: str, maximum: int = 128) -> str:
    if not isinstance(value, str) or not value.strip():
        raise BitableTableConfigError(f"{field} 为必填项")
    value = value.strip()
    if len(value) > maximum:
        raise BitableTableConfigError(f"{field} 长度不能超过 {maximum}")
    return value


def _validate_payload(payload: dict[str, Any], *, partial: bool = False) -> dict[str, Any]:
    fields: dict[str, Any] = {}
    if not partial or "object_code" in payload:
        code = _require_text(payload.get("object_code"), "对象编码", 64)
        if not _OBJECT_CODE_RE.fullmatch(code):
            raise BitableTableConfigError("对象编码仅允许大写字母、数字和下划线，且以字母开头")
        fields["object_code"] = code
    for key, label, maximum in (("object_name", "对象名称", 128), ("app_token", "App Token", 128), ("table_id", "Table ID", 128)):
        if not partial or key in payload:
            fields[key] = _require_text(payload.get(key), label, maximum)
    if "view_id" in payload:
        fields["view_id"] = _require_text(payload["view_id"], "View ID", 128) if payload["view_id"] else None
    for key in ("field_mapping", "filter_config"):
        if key in payload:
            value = payload[key]
            if not isinstance(value, dict) or any(not isinstance(k, str) for k in value):
                raise BitableTableConfigError(f"{key} 必须是键为字符串的 JSON 对象")
            fields[key] = value
    for key, default, upper in (("page_size", 100, 500), ("max_records", 10000, 50000)):
        if not partial or key in payload:
            value = payload.get(key, default)
            if not isinstance(value, int) or isinstance(value, bool) or not 1 <= value <= upper:
                raise BitableTableConfigError(f"{key} 必须在 1 到 {upper} 之间")
            fields[key] = value
    if "is_active" in payload:
        fields["is_active"] = 1 if bool(payload["is_active"]) else 0
    return fields


async def get_bitable_resource(db: AsyncSession, resource_id: int) -> UcpResource:
    resource = await db.get(UcpResource, resource_id)
    if resource is None:
        raise BitableTableConfigError("资源不存在")
    if resource.adapter_code != BITABLE_ADAPTER_CODE:
        raise BitableTableConfigError("该资源未使用飞书多维表格读取适配器")
    return resource


async def list_bitable_tables(db: AsyncSession, resource_id: int, *, is_active: bool | None = None) -> list[UcpBitableTableConfig]:
    await get_bitable_resource(db, resource_id)
    stmt = select(UcpBitableTableConfig).where(UcpBitableTableConfig.resource_id == resource_id)
    if is_active is not None:
        stmt = stmt.where(UcpBitableTableConfig.is_active == (1 if is_active else 0))
    return list((await db.execute(stmt.order_by(UcpBitableTableConfig.id.desc()))).scalars().all())


async def get_bitable_table(db: AsyncSession, resource_id: int, table_config_id: int, *, require_active: bool = False) -> UcpBitableTableConfig:
    await get_bitable_resource(db, resource_id)
    obj = await db.get(UcpBitableTableConfig, table_config_id)
    if obj is None or obj.resource_id != resource_id:
        raise BitableTableConfigError("数据对象不存在或不属于当前资源")
    if require_active and not obj.is_active:
        raise BitableTableConfigError("数据对象已停用")
    return obj


async def create_bitable_table(db: AsyncSession, resource_id: int, payload: dict[str, Any], *, created_by: str | None) -> UcpBitableTableConfig:
    await get_bitable_resource(db, resource_id)
    fields = _validate_payload(payload)
    duplicate = (await db.execute(select(UcpBitableTableConfig.id).where(UcpBitableTableConfig.resource_id == resource_id, UcpBitableTableConfig.object_code == fields["object_code"]))).scalar_one_or_none()
    if duplicate is not None:
        raise BitableTableConfigError("当前资源下对象编码已存在")
    obj = UcpBitableTableConfig(resource_id=resource_id, created_by=created_by, updated_by=created_by, field_mapping=fields.pop("field_mapping", {}), filter_config=fields.pop("filter_config", {}), **fields)
    db.add(obj)
    await db.commit()
    await db.refresh(obj)
    return obj


async def update_bitable_table(db: AsyncSession, resource_id: int, table_config_id: int, payload: dict[str, Any], *, updated_by: str | None) -> UcpBitableTableConfig:
    obj = await get_bitable_table(db, resource_id, table_config_id)
    fields = _validate_payload(payload, partial=True)
    if "object_code" in fields and fields["object_code"] != obj.object_code:
        duplicate = (await db.execute(select(UcpBitableTableConfig.id).where(UcpBitableTableConfig.resource_id == resource_id, UcpBitableTableConfig.object_code == fields["object_code"], UcpBitableTableConfig.id != table_config_id))).scalar_one_or_none()
        if duplicate is not None:
            raise BitableTableConfigError("当前资源下对象编码已存在")
    for key, value in fields.items():
        setattr(obj, key, value)
    obj.updated_by = updated_by
    await db.commit()
    await db.refresh(obj)
    return obj


async def delete_bitable_table(db: AsyncSession, resource_id: int, table_config_id: int) -> None:
    obj = await get_bitable_table(db, resource_id, table_config_id)
    from app.ucp.models import UcpPipelineTemplate
    for nodes in (await db.execute(select(UcpPipelineTemplate.nodes_json))).scalars().all():
        for node in nodes or []:
            if (node.get("config") or {}).get("bitable_table_id") == table_config_id:
                raise BitableTableConfigError("数据对象已被流水线模板引用，无法删除")
    await db.delete(obj)
    await db.commit()


def serialize_bitable_table(obj: UcpBitableTableConfig) -> dict[str, Any]:
    def mask(value: str | None) -> str | None:
        return value if not value or len(value) <= 6 else f"{value[:3]}***{value[-3:]}"
    return {"id": obj.id, "resource_id": obj.resource_id, "object_code": obj.object_code, "object_name": obj.object_name, "app_token": obj.app_token, "app_token_masked": mask(obj.app_token), "table_id": obj.table_id, "table_id_masked": mask(obj.table_id), "view_id": obj.view_id, "field_mapping": obj.field_mapping or {}, "filter_config": obj.filter_config or {}, "page_size": obj.page_size, "max_records": obj.max_records, "is_active": bool(obj.is_active), "created_by": obj.created_by, "updated_by": obj.updated_by, "created_at": obj.created_at.isoformat() if obj.created_at else None, "updated_at": obj.updated_at.isoformat() if obj.updated_at else None}


def table_params(obj: UcpBitableTableConfig) -> dict[str, Any]:
    return {"app_token": obj.app_token, "table_id": obj.table_id, "view_id": obj.view_id, "field_mapping": obj.field_mapping or {}, "filter_config": obj.filter_config or {}, "page_size": obj.page_size, "max_records": obj.max_records}