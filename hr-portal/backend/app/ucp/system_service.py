"""Phase 4: 接入系统 service 层

- ConnectorSystem  业务系统（北森/飞书）
- ConnectorResource 数据资源（员工表/组织表）
- ConnectorCredential 凭证（解耦，可被 N 个 resource 共享）

Phase 5-4: resource JSON 字段按 adapter schema 校验
"""
from __future__ import annotations

from typing import Any, Sequence

from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.ucp.models import (
    ConnectorSystem,
    ConnectorResource,
    ConnectorCredential,
)
from app.ucp.adapter_schema import (
    extract_categories,
    validate_payload_against_schema,
)


class ResourceSchemaError(ValueError):
    """resource 字段不符合 adapter schema."""


# ===== ConnectorSystem =====


async def list_systems(
    db: AsyncSession, system_type: str | None = None, is_active: int | None = None
) -> list[ConnectorSystem]:
    stmt = select(ConnectorSystem)
    if system_type:
        stmt = stmt.where(ConnectorSystem.system_type == system_type)
    if is_active is not None:
        stmt = stmt.where(ConnectorSystem.is_active == is_active)
    stmt = stmt.order_by(ConnectorSystem.system_code)
    r = await db.execute(stmt)
    return list(r.scalars().all())


async def get_system(db: AsyncSession, system_id: int) -> ConnectorSystem | None:
    return await db.get(ConnectorSystem, system_id)


async def get_system_by_code(db: AsyncSession, system_code: str) -> ConnectorSystem | None:
    stmt = select(ConnectorSystem).where(ConnectorSystem.system_code == system_code)
    r = await db.execute(stmt)
    return r.scalar_one_or_none()


async def create_system(
    db: AsyncSession,
    *,
    system_code: str,
    system_name: str,
    system_type: str = "CUSTOM",
    icon: str | None = None,
    owner: str | None = None,
    description: str | None = None,
    created_by: str | None = None,
) -> ConnectorSystem:
    obj = ConnectorSystem(
        system_code=system_code,
        system_name=system_name,
        system_type=system_type,
        icon=icon,
        owner=owner,
        description=description,
        created_by=created_by,
    )
    db.add(obj)
    await db.commit()
    await db.refresh(obj)
    return obj


async def update_system(db: AsyncSession, system_id: int, **fields) -> ConnectorSystem | None:
    obj = await db.get(ConnectorSystem, system_id)
    if not obj:
        return None
    for k, v in fields.items():
        if v is not None and hasattr(obj, k):
            setattr(obj, k, v)
    await db.commit()
    await db.refresh(obj)
    return obj


async def delete_system(db: AsyncSession, system_id: int) -> bool:
    obj = await db.get(ConnectorSystem, system_id)
    if not obj:
        return False
    # 解绑该系统下的所有凭证 (FK ON DELETE RESTRICT, 凭证保留不删)
    from sqlalchemy import update
    await db.execute(
        update(ConnectorCredential)
        .where(ConnectorCredential.system_id == system_id)
        .values(system_id=None)
    )
    await db.delete(obj)
    await db.commit()
    return True


# ===== ConnectorResource =====


async def list_resources(
    db: AsyncSession,
    *,
    system_id: int | None = None,
    credential_id: int | None = None,
    status: int | None = None,
) -> list[ConnectorResource]:
    # Phase 5-2: join system 以便返回 system_code (前端订阅资源下拉用)
    stmt = select(ConnectorResource, ConnectorSystem.system_code).join(
        ConnectorSystem, ConnectorResource.system_id == ConnectorSystem.id
    )
    if system_id is not None:
        stmt = stmt.where(ConnectorResource.system_id == system_id)
    if credential_id is not None:
        stmt = stmt.where(ConnectorResource.credential_id == credential_id)
    if status is not None:
        stmt = stmt.where(ConnectorResource.status == status)
    stmt = stmt.order_by(ConnectorResource.system_id, ConnectorResource.resource_code)
    r = await db.execute(stmt)
    rows = r.all()
    # 列表保持原行为(只返回 ConnectorResource),但把 system_code 挂到对象属性
    resources: list[ConnectorResource] = []
    for res, sys_code in rows:
        setattr(res, "system_code", sys_code)
        resources.append(res)
    return resources


async def get_resource(db: AsyncSession, resource_id: int) -> ConnectorResource | None:
    return await db.get(ConnectorResource, resource_id)


async def create_resource(
    db: AsyncSession,
    *,
    system_id: int,
    resource_code: str,
    resource_name: str,
    adapter_code: str | None = None,
    credential_id: int | None = None,
    protocol: dict | None = None,
    report_config: dict | None = None,
    mapping_config: dict | None = None,
    file_config: dict | None = None,
    scheduling: dict | None = None,
    notification_config: dict | None = None,
    retry_config: dict | None = None,
    circuit_breaker_config: dict | None = None,
    created_by: str | None = None,
    # Phase 5-4: 跳过 schema 校验(供导入脚本/迁移使用)
    skip_schema_validation: bool = False,
) -> ConnectorResource:
    # Phase 5-4: 按 adapter schema 校验 8 个 JSON 字段
    if not skip_schema_validation:
        _validate_resource_fields_against_schema(
            db,
            adapter_code=adapter_code,
            fields={
                "protocol": protocol,
                "report_config": report_config,
                "mapping_config": mapping_config,
                "file_config": file_config,
                "scheduling": scheduling,
                "notification_config": notification_config,
                "retry_config": retry_config,
                "circuit_breaker_config": circuit_breaker_config,
            },
        )

    obj = ConnectorResource(
        system_id=system_id,
        resource_code=resource_code,
        resource_name=resource_name,
        adapter_code=adapter_code,
        credential_id=credential_id,
        protocol=protocol,
        report_config=report_config,
        mapping_config=mapping_config,
        file_config=file_config,
        scheduling=scheduling,
        notification_config=notification_config,
        retry_config=retry_config,
        circuit_breaker_config=circuit_breaker_config,
        created_by=created_by,
    )
    db.add(obj)
    await db.commit()
    await db.refresh(obj)
    return obj


async def update_resource(
    db: AsyncSession,
    resource_id: int,
    *,
    skip_schema_validation: bool = False,
    **fields,
) -> ConnectorResource | None:
    obj = await db.get(ConnectorResource, resource_id)
    if not obj:
        return None

    # Phase 5-4: 收集将要写入的 JSON 字段,做合并校验
    # 1) 先确定最终 adapter_code (可能本次更新, 也可能沿用旧的)
    final_adapter_code = fields.get("adapter_code", obj.adapter_code)
    if not skip_schema_validation:
        merged: dict[str, Any] = {
            "protocol": fields.get("protocol", obj.protocol),
            "report_config": fields.get("report_config", obj.report_config),
            "mapping_config": fields.get("mapping_config", obj.mapping_config),
            "file_config": fields.get("file_config", obj.file_config),
            "scheduling": fields.get("scheduling", obj.scheduling),
            "notification_config": fields.get(
                "notification_config", obj.notification_config
            ),
            "retry_config": fields.get("retry_config", obj.retry_config),
            "circuit_breaker_config": fields.get(
                "circuit_breaker_config", obj.circuit_breaker_config
            ),
        }
        # 过滤 None: 客户端未传 = 不动 = 用对象原值
        merged = {k: v for k, v in merged.items() if v is not None}
        _validate_resource_fields_against_schema(
            db, adapter_code=final_adapter_code, fields=merged
        )

    for k, v in fields.items():
        if hasattr(obj, k):
            setattr(obj, k, v)
    await db.commit()
    await db.refresh(obj)
    return obj


async def _validate_resource_fields_against_schema(
    db: AsyncSession,
    *,
    adapter_code: str | None,
    fields: dict[str, Any],
) -> None:
    """根据 adapter schema 校验 resource 的 JSON 字段 payload.

    - adapter_code 为空 / schema 为空 / schema 无 categories → 跳过校验
    - 任一字段类型错误 / 必填缺失 → 抛 ResourceSchemaError
    """
    if not adapter_code:
        return
    # 避免循环 import
    from app.ucp.adapter_registry import get_adapter_definition

    defn = await get_adapter_definition(db, adapter_code)
    if defn is None or not defn.schema_json:
        return
    categories = extract_categories(defn.schema_json)
    if not categories:
        return
    errors = validate_payload_against_schema(fields, categories)
    if errors:
        # 取首条作主错误, 其余 join
        raise ResourceSchemaError("; ".join(errors))


async def delete_resource(db: AsyncSession, resource_id: int) -> bool:
    obj = await db.get(ConnectorResource, resource_id)
    if not obj:
        return False
    await db.delete(obj)
    await db.commit()
    return True


# ===== 聚合视图：系统 + 资源 + 凭证 =====


async def get_system_overview(
    db: AsyncSession, system_id: int
) -> dict[str, Any] | None:
    """系统详情：包含其下所有资源 + 凭证.

    凭证查询策略：直接按 system_id 查 connector_credentials
    （不依赖 resource.credential_id 间接查），因为凭证可能在
    还没有资源的情况下就已经录入（Phase 4-2 凭证强绑 system 模式）。
    """
    sys = await db.get(ConnectorSystem, system_id)
    if not sys:
        return None
    resources = await list_resources(db, system_id=system_id)

    # 直接按 system_id 查凭证（核心修复：之前从 resource.credential_id 间接查）
    cred_stmt = (
        select(ConnectorCredential)
        .where(ConnectorCredential.system_id == system_id)
        .order_by(ConnectorCredential.is_primary.desc(), ConnectorCredential.id.asc())
    )
    cred_r = await db.execute(cred_stmt)
    credentials = list(cred_r.scalars().all())

    return {
        "system": sys,
        "resources": resources,
        "credentials": credentials,
    }


async def list_systems_with_resource_count(
    db: AsyncSession,
) -> list[dict[str, Any]]:
    """列出所有系统 + 资源数量 + 凭证数量（聚合查询）."""
    sys_list = await list_systems(db)

    # 按 system_id 聚合资源数
    stmt = (
        select(
            ConnectorResource.system_id,
            func.count(ConnectorResource.id).label("resource_count"),
            func.sum(func.coalesce(ConnectorResource.status, 0)).label("active_count"),
        )
        .group_by(ConnectorResource.system_id)
    )
    r = await db.execute(stmt)
    res_map = {row.system_id: row for row in r.all()}

    out: list[dict[str, Any]] = []
    for s in sys_list:
        agg = res_map.get(s.id)
        out.append(
            {
                "system": s,
                "resource_count": int(agg.resource_count) if agg else 0,
                "active_count": int(agg.active_count or 0) if agg else 0,
            }
        )
    return out


async def find_credential_id_for_system(
    db: AsyncSession, system_id: int
) -> int | None:
    """查找该系统下任意 resource 使用的凭证 ID（用于「添加表」时默认带出凭证）."""
    stmt = (
        select(ConnectorResource.credential_id)
        .where(ConnectorResource.system_id == system_id)
        .where(ConnectorResource.credential_id.is_not(None))
        .limit(1)
    )
    r = await db.execute(stmt)
    return r.scalar_one_or_none()
