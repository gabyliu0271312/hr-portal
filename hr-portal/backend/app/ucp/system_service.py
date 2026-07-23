"""Phase 4: 接入系统 service 层

- UcpSystem  业务系统（北森/飞书）
- UcpResource 数据资源（员工表/组织表）
- UcpCredential 凭证（解耦，可被 N 个 resource 共享）

Phase 5-4: resource JSON 字段按 adapter schema 校验
"""
from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Any, Sequence

from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.ucp.models import (
    UcpSystem,
    UcpResource,
    UcpCredential,
    UcpPipelineExecution,
    UcpPipelineTemplate,
    UcpEventDelivery,
)
from app.ucp.adapter_schema import (
    extract_categories,
    validate_payload_against_schema,
)


class ResourceSchemaError(ValueError):
    """resource 字段不符合 adapter schema."""


# ===== UcpSystem =====


async def list_systems(
    db: AsyncSession, system_type: str | None = None, is_active: int | None = None
) -> list[UcpSystem]:
    stmt = select(UcpSystem)
    if system_type:
        stmt = stmt.where(UcpSystem.system_type == system_type)
    if is_active is not None:
        stmt = stmt.where(UcpSystem.is_active == is_active)
    stmt = stmt.order_by(UcpSystem.system_code)
    r = await db.execute(stmt)
    return list(r.scalars().all())


async def get_system(db: AsyncSession, system_id: int) -> UcpSystem | None:
    return await db.get(UcpSystem, system_id)


async def get_system_by_code(db: AsyncSession, system_code: str) -> UcpSystem | None:
    stmt = select(UcpSystem).where(UcpSystem.system_code == system_code)
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
) -> UcpSystem:
    obj = UcpSystem(
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


async def update_system(db: AsyncSession, system_id: int, **fields) -> UcpSystem | None:
    obj = await db.get(UcpSystem, system_id)
    if not obj:
        return None
    for k, v in fields.items():
        if v is not None and hasattr(obj, k):
            setattr(obj, k, v)
    await db.commit()
    await db.refresh(obj)
    return obj


async def delete_system(db: AsyncSession, system_id: int) -> bool:
    obj = await db.get(UcpSystem, system_id)
    if not obj:
        return False
    # 解绑该系统下的所有凭证 (FK ON DELETE RESTRICT, 凭证保留不删)
    from sqlalchemy import update
    await db.execute(
        update(UcpCredential)
        .where(UcpCredential.system_id == system_id)
        .values(system_id=None)
    )
    await db.delete(obj)
    await db.commit()
    return True


# ===== UcpResource =====


async def list_resources(
    db: AsyncSession,
    *,
    system_id: int | None = None,
    credential_id: int | None = None,
    status: int | None = None,
) -> list[UcpResource]:
    # Phase 5-2: join system 以便返回 system_code (前端订阅资源下拉用)
    stmt = select(UcpResource, UcpSystem.system_code).join(
        UcpSystem, UcpResource.system_id == UcpSystem.id
    )
    if system_id is not None:
        stmt = stmt.where(UcpResource.system_id == system_id)
    if credential_id is not None:
        stmt = stmt.where(UcpResource.credential_id == credential_id)
    if status is not None:
        stmt = stmt.where(UcpResource.status == status)
    stmt = stmt.order_by(UcpResource.system_id, UcpResource.resource_code)
    r = await db.execute(stmt)
    rows = r.all()
    # 列表保持原行为(只返回 UcpResource),但把 system_code 挂到对象属性
    resources: list[UcpResource] = []
    for res, sys_code in rows:
        setattr(res, "system_code", sys_code)
        resources.append(res)
    return resources


async def get_resource(db: AsyncSession, resource_id: int) -> UcpResource | None:
    return await db.get(UcpResource, resource_id)


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
) -> UcpResource:
    # Phase 5-4: 按 adapter schema 校验 8 个 JSON 字段
    if not skip_schema_validation:
        await _validate_resource_fields_against_schema(
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

    obj = UcpResource(
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
) -> UcpResource | None:
    obj = await db.get(UcpResource, resource_id)
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
        await _validate_resource_fields_against_schema(
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
    obj = await db.get(UcpResource, resource_id)
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

    凭证查询策略：直接按 system_id 查 ucp_credentials
    （不依赖 resource.credential_id 间接查），因为凭证可能在
    还没有资源的情况下就已经录入（Phase 4-2 凭证强绑 system 模式）。
    """
    sys = await db.get(UcpSystem, system_id)
    if not sys:
        return None
    resources = await list_resources(db, system_id=system_id)

    # 直接按 system_id 查凭证（核心修复：之前从 resource.credential_id 间接查）
    cred_stmt = (
        select(UcpCredential)
        .where(UcpCredential.system_id == system_id)
        .order_by(UcpCredential.is_primary.desc(), UcpCredential.id.asc())
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
            UcpResource.system_id,
            func.count(UcpResource.id).label("resource_count"),
            func.sum(func.coalesce(UcpResource.status, 0)).label("active_count"),
        )
        .group_by(UcpResource.system_id)
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
        select(UcpResource.credential_id)
        .where(UcpResource.system_id == system_id)
        .where(UcpResource.credential_id.is_not(None))
        .limit(1)
    )
    r = await db.execute(stmt)
    return r.scalar_one_or_none()


async def get_systems_overview(db: AsyncSession) -> list[dict[str, Any]]:
    """系统卡片聚合数据：资源数、流水线数、24h 同步次数、成功率、凭证状态。

    用于前端首页系统卡片，所有指标来自真实数据，不根据系统名称硬编码推断。
    """
    # 1. 系统列表 + 资源数
    sys_data = await list_systems_with_resource_count(db)

    # 2. 资源 → 系统映射
    res_stmt = select(UcpResource.id, UcpResource.system_id)
    res_rows = (await db.execute(res_stmt)).all()
    resource_system: dict[int, int] = {r.id: r.system_id for r in res_rows}

    # 3. 流水线模板 → 系统（通过 nodes_json 中的 resource_id）
    tpl_stmt = select(UcpPipelineTemplate)
    tpls = (await db.execute(tpl_stmt)).scalars().all()
    pipeline_per_system: dict[int, set[int]] = defaultdict(set)
    for tpl in tpls:
        nodes = tpl.nodes_json or []
        for n in nodes:
            cfg = n.get("config") if isinstance(n, dict) else {}
            res_id = cfg.get("resource_id")
            if isinstance(res_id, int) and res_id in resource_system:
                pipeline_per_system[resource_system[res_id]].add(tpl.id)

    # 4. 24h 执行统计（按 pipeline_code 聚合，再反查系统）
    since = datetime.now(timezone.utc) - timedelta(hours=24)
    exec_stmt = (
        select(UcpPipelineExecution)
        .where(UcpPipelineExecution.created_at >= since)
    )
    execs = (await db.execute(exec_stmt)).scalars().all()

    # pipeline_code → system_id（通过模板 nodes_json 反查）
    tpl_code_to_systems: dict[str, set[int]] = defaultdict(set)
    for tpl in tpls:
        nodes = tpl.nodes_json or []
        for n in nodes:
            cfg = n.get("config") if isinstance(n, dict) else {}
            res_id = cfg.get("resource_id")
            if isinstance(res_id, int) and res_id in resource_system:
                tpl_code_to_systems[tpl.template_code].add(resource_system[res_id])

    exec_per_system: dict[int, dict] = defaultdict(lambda: {"total": 0, "success": 0, "latest": None})
    for e in execs:
        sys_ids = tpl_code_to_systems.get(e.pipeline_code, set())
        for sid in sys_ids:
            exec_per_system[sid]["total"] += 1
            if e.status in ("SUCCESS", "PARTIAL_SUCCESS"):
                exec_per_system[sid]["success"] += 1
            if e.started_at and (
                exec_per_system[sid]["latest"] is None
                or e.started_at > exec_per_system[sid]["latest"]
            ):
                exec_per_system[sid]["latest"] = e.started_at

    # 5. 凭证状态（过期检测）
    cred_stmt = select(UcpCredential)
    creds = (await db.execute(cred_stmt)).scalars().all()
    now = datetime.now(timezone.utc)
    cred_per_system: dict[int, dict] = defaultdict(lambda: {"total": 0, "expired": 0, "warn": 0})
    for c in creds:
        if not c.system_id:
            continue
        sid = c.system_id
        cred_per_system[sid]["total"] += 1
        if c.expires_at:
            exp = c.expires_at.replace(tzinfo=timezone.utc) if c.expires_at.tzinfo is None else c.expires_at
            if exp < now:
                cred_per_system[sid]["expired"] += 1
            elif (exp - now).days < 7:
                cred_per_system[sid]["warn"] += 1

    # 6. 死信数量（按 trigger_code 模糊匹配 system_code）
    dl_stmt = (
        select(UcpEventDelivery.trigger_code, func.count(UcpEventDelivery.id))
        .where(UcpEventDelivery.status == "DEAD_LETTER")
        .group_by(UcpEventDelivery.trigger_code)
    )
    dl_rows = (await db.execute(dl_stmt)).all()
    dl_count_per_system: dict[int, int] = defaultdict(int)
    for item in sys_data:
        sc = item["system"].system_code.lower()
        for dl_row in dl_rows:
            if dl_row.trigger_code and sc in dl_row.trigger_code.lower():
                dl_count_per_system[item["system"].id] += dl_row[1]

    # 7. 组装返回
    result: list[dict[str, Any]] = []
    for item in sys_data:
        s = item["system"]
        sid = s.id
        exec_stats = exec_per_system.get(sid, {})
        exec_total = exec_stats.get("total", 0)
        exec_success = exec_stats.get("success", 0)
        cred_stats = cred_per_system.get(sid, {})

        if cred_stats.get("expired", 0) > 0:
            cred_status = "expired"
        elif cred_stats.get("warn", 0) > 0:
            cred_status = "warning"
        elif cred_stats.get("total", 0) == 0:
            cred_status = "none"
        else:
            cred_status = "ok"

        if not s.is_active:
            health_status = "offline"
        elif cred_status == "expired":
            health_status = "blocked"
        elif exec_total > 0 and exec_success == 0:
            health_status = "failing"
        elif cred_status == "warning":
            health_status = "warning"
        elif exec_total == 0 and cred_stats.get("total", 0) == 0:
            health_status = "unconfigured"
        else:
            health_status = "ok"

        result.append({
            "system_id": sid,
            "resource_count": item["resource_count"],
            "active_count": item["active_count"],
            "pipeline_count": len(pipeline_per_system.get(sid, set())),
            "sync_count_24h": exec_total,
            "success_count_24h": exec_success,
            "success_rate_24h": round(exec_success / exec_total, 4) if exec_total > 0 else None,
            "dead_letter_count": dl_count_per_system.get(sid, 0),
            "latest_run_at": exec_stats.get("latest").isoformat() if exec_stats.get("latest") else None,
            "credential_status": cred_status,
            "credential_count": cred_stats.get("total", 0),
            "health_status": health_status,
        })

    return result
