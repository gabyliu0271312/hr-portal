"""UCP 系统配置服务

Phase 1B 扩展：完整 CRUD + 启用/停用 + 配置版本查看 + 回滚 + 映射引擎配置化。
"""
from __future__ import annotations

import logging
from copy import deepcopy

from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.ucp.models import (
    UcpConfigVersion,
    UcpPipelineConfig,
    UcpSystemConfig,
)

logger = logging.getLogger("ucp.config_service")


# ===== 系统配置 =====

async def get_system_config_by_code(
    db: AsyncSession,
    system_code: str,
) -> UcpSystemConfig | None:
    """按 system_code 查询系统配置。"""
    return (
        await db.execute(
            select(UcpSystemConfig).where(
                UcpSystemConfig.system_code == system_code
            )
        )
    ).scalar_one_or_none()


async def get_system_config_by_id(
    db: AsyncSession,
    config_id: int,
) -> UcpSystemConfig | None:
    """按 ID 查询系统配置。"""
    return await db.get(UcpSystemConfig, config_id)


async def get_enabled_system_config_by_code(
    db: AsyncSession,
    system_code: str,
) -> UcpSystemConfig | None:
    """查询已启用的系统配置。"""
    conn = await get_system_config_by_code(db, system_code)
    if conn is None:
        raise RuntimeError(f"System '{system_code}' not found")
    if conn.status != 1:
        raise RuntimeError(f"System '{system_code}' is not enabled (status={conn.status})")
    return conn


async def list_system_configs(
    db: AsyncSession,
    adapter_type: str | None = None,
    status: int | None = None,
) -> list[UcpSystemConfig]:
    """列出系统配置，支持按类型和状态过滤。"""
    stmt = select(UcpSystemConfig).order_by(UcpSystemConfig.id)
    if adapter_type:
        stmt = stmt.where(UcpSystemConfig.adapter_type == adapter_type)
    if status is not None:
        stmt = stmt.where(UcpSystemConfig.status == status)
    return (await db.execute(stmt)).scalars().all()


async def upsert_system_config(
    db: AsyncSession,
    system_code: str,
    system_name: str,
    adapter_type: str,
    direction: str = "INBOUND",
    adapter_code: str | None = None,
    protocol: dict | None = None,
    credential_id: int | None = None,
    report_config: dict | None = None,
    scheduling: dict | None = None,
    mapping_config: dict | None = None,
    retry_config: dict | None = None,
    notification_config: dict | None = None,
    run_as_type: str = "SERVICE_ACCOUNT",
    service_account_code: str | None = None,
    owner: str | None = None,
    description: str | None = None,
    created_by: str | None = None,
) -> UcpSystemConfig:
    """按 system_code 幂等创建或更新系统配置。

    每次变更自动记录配置版本。
    """
    existing = await get_system_config_by_code(db, system_code)
    if existing is None:
        conn = UcpSystemConfig(
            system_code=system_code,
            system_name=system_name,
            adapter_type=adapter_type,
            direction=direction,
            description=description,
            adapter_code=adapter_code,
            protocol=protocol or {},
            credential_id=credential_id,
            report_config=report_config,
            scheduling=scheduling,
            mapping_config=mapping_config or {"enabled": False},
            retry_config=retry_config,
            notification_config=notification_config,
            run_as_type=run_as_type,
            service_account_code=service_account_code,
            owner=owner,
            status=1,
            created_by=created_by,
        )
        db.add(conn)
        await db.flush()
        await _save_config_version(db, system_code, 1, conn, "initial_create", created_by)
        logger.info("[ucp] system config created: code=%s type=%s", system_code, adapter_type)
        return conn

    # 更新已有配置
    existing.system_name = system_name
    existing.adapter_type = adapter_type
    existing.direction = direction
    if description is not None:
        existing.description = description
    if adapter_code is not None:
        existing.adapter_code = adapter_code
    if protocol is not None:
        existing.protocol = protocol
    if credential_id is not None:
        existing.credential_id = credential_id
    if report_config is not None:
        existing.report_config = report_config
    if scheduling is not None:
        existing.scheduling = scheduling
    if mapping_config is not None:
        existing.mapping_config = mapping_config
    if retry_config is not None:
        existing.retry_config = retry_config
    if notification_config is not None:
        existing.notification_config = notification_config
    if service_account_code is not None:
        existing.service_account_code = service_account_code
    if owner is not None:
        existing.owner = owner
    existing.updated_by = created_by
    existing.version += 1
    await db.flush()

    await _save_config_version(db, system_code, existing.version, existing, "config_update", created_by)
    logger.info("[ucp] system config updated: code=%s version=%d", system_code, existing.version)
    return existing


async def update_system_config_fields(
    db: AsyncSession,
    config_id: int,
    update_fields: dict,
    updated_by: str | None = None,
) -> UcpSystemConfig:
    """部分更新系统配置字段。

    只更新传入的字段，未传入的字段保持不变。
    自动记录配置版本。
    """
    conn = await db.get(UcpSystemConfig, config_id)
    if conn is None:
        raise RuntimeError(f"System {config_id} not found")

    allowed_fields = {
        "system_name", "description", "adapter_code", "protocol",
        "credential_id", "report_config", "scheduling", "mapping_config",
        "retry_config", "notification_config", "run_as_type",
        "service_account_code", "owner", "direction",
    }

    changed = False
    for key, value in update_fields.items():
        if key in allowed_fields:
            setattr(conn, key, value)
            changed = True

    if changed:
        conn.updated_by = updated_by
        conn.version += 1
        await db.flush()
        await _save_config_version(
            db, conn.system_code, conn.version, conn,
            f"partial_update: {', '.join(k for k in update_fields if k in allowed_fields)}",
            updated_by,
        )
        logger.info("[ucp] system config partially updated: code=%s fields=%s",
                     conn.system_code, list(update_fields.keys()))

    return conn


async def toggle_system_config(
    db: AsyncSession,
    config_id: int,
    status: int,
    updated_by: str | None = None,
) -> UcpSystemConfig:
    """启用或停用系统配置。

    status: 0=未启用, 1=启用, 2=停用
    停用后系统配置不会被 Pipeline Engine 执行。
    """
    conn = await db.get(UcpSystemConfig, config_id)
    if conn is None:
        raise RuntimeError(f"System {config_id} not found")

    old_status = conn.status
    conn.status = status
    conn.updated_by = updated_by
    conn.version += 1
    await db.flush()

    status_label = {0: "未启用", 1: "启用", 2: "停用"}
    await _save_config_version(
        db, conn.system_code, conn.version,
        conn, f"status_change: {status_label.get(old_status, old_status)} → {status_label.get(status, status)}",
        updated_by,
    )
    logger.info("[ucp] system config toggled: code=%s %s → %s",
                 conn.system_code, status_label.get(old_status, "?"), status_label.get(status, "?"))
    return conn


async def delete_system_config(
    db: AsyncSession,
    config_id: int,
    deleted_by: str | None = None,
) -> bool:
    """删除系统配置（物理删除）。

    调用前应确保没有 Pipeline 正在引用该系统配置。
    """
    conn = await db.get(UcpSystemConfig, config_id)
    if conn is None:
        return False
    await db.delete(conn)
    await db.flush()
    logger.info("[ucp] system config deleted: code=%s by=%s", conn.system_code, deleted_by)
    return True


# ===== 流水线配置 =====

async def get_pipeline_by_code(
    db: AsyncSession,
    pipeline_code: str,
) -> UcpPipelineConfig | None:
    """按 pipeline_code 查询流水线配置。"""
    return (
        await db.execute(
            select(UcpPipelineConfig).where(
                UcpPipelineConfig.pipeline_code == pipeline_code
            )
        )
    ).scalar_one_or_none()


async def get_pipeline_by_id(
    db: AsyncSession,
    pipeline_id: int,
) -> UcpPipelineConfig | None:
    """按 ID 查询流水线配置。"""
    return await db.get(UcpPipelineConfig, pipeline_id)


async def get_enabled_pipeline_by_code(
    db: AsyncSession,
    pipeline_code: str,
) -> UcpPipelineConfig | None:
    """查询已启用的流水线配置。"""
    pl = await get_pipeline_by_code(db, pipeline_code)
    if pl is None:
        raise RuntimeError(f"Pipeline '{pipeline_code}' not found")
    if pl.status != 1:
        raise RuntimeError(f"Pipeline '{pipeline_code}' is not enabled (status={pl.status})")
    return pl


async def list_pipelines(
    db: AsyncSession,
    trigger_type: str | None = None,
    status: int | None = None,
) -> list[UcpPipelineConfig]:
    """列出流水线配置，支持按触发类型和状态过滤。"""
    stmt = select(UcpPipelineConfig).order_by(UcpPipelineConfig.id)
    if trigger_type:
        stmt = stmt.where(UcpPipelineConfig.trigger_type == trigger_type)
    if status is not None:
        stmt = stmt.where(UcpPipelineConfig.status == status)
    return (await db.execute(stmt)).scalars().all()


async def upsert_pipeline(
    db: AsyncSession,
    pipeline_code: str,
    pipeline_name: str,
    steps: list[dict],
    trigger_type: str = "SCHEDULED",
    trigger_config: dict | None = None,
    error_handling: str = "STOP_ON_ERROR",
    notification_config: dict | None = None,
    run_as_type: str = "SERVICE_ACCOUNT",
    service_account_code: str | None = None,
    description: str | None = None,
    created_by: str | None = None,
) -> UcpPipelineConfig:
    """按 pipeline_code 幂等创建或更新流水线配置。"""
    existing = await get_pipeline_by_code(db, pipeline_code)
    if existing is None:
        pl = UcpPipelineConfig(
            pipeline_code=pipeline_code,
            pipeline_name=pipeline_name,
            description=description,
            steps=steps,
            trigger_type=trigger_type,
            trigger_config=trigger_config,
            error_handling=error_handling,
            notification_config=notification_config,
            run_as_type=run_as_type,
            service_account_code=service_account_code,
            status=1,
            created_by=created_by,
        )
        db.add(pl)
        await db.flush()
        logger.info("[ucp] pipeline created: code=%s trigger=%s steps=%d",
                     pipeline_code, trigger_type, len(steps))
        return pl

    existing.pipeline_name = pipeline_name
    if description is not None:
        existing.description = description
    existing.steps = steps
    existing.trigger_type = trigger_type
    if trigger_config is not None:
        existing.trigger_config = trigger_config
    if error_handling is not None:
        existing.error_handling = error_handling
    if notification_config is not None:
        existing.notification_config = notification_config
    if service_account_code is not None:
        existing.service_account_code = service_account_code
    existing.updated_by = created_by
    await db.flush()
    logger.info("[ucp] pipeline updated: code=%s", pipeline_code)
    return existing


async def update_pipeline_fields(
    db: AsyncSession,
    pipeline_id: int,
    update_fields: dict,
    updated_by: str | None = None,
) -> UcpPipelineConfig:
    """部分更新流水线配置字段。"""
    pl = await db.get(UcpPipelineConfig, pipeline_id)
    if pl is None:
        raise RuntimeError(f"Pipeline {pipeline_id} not found")

    allowed_fields = {
        "pipeline_name", "description", "steps", "trigger_type",
        "trigger_config", "error_handling", "notification_config",
        "run_as_type", "service_account_code",
    }

    changed = False
    for key, value in update_fields.items():
        if key in allowed_fields:
            setattr(pl, key, value)
            changed = True

    if changed:
        pl.updated_by = updated_by
        await db.flush()
        logger.info("[ucp] pipeline partially updated: code=%s fields=%s",
                     pl.pipeline_code, list(update_fields.keys()))

    return pl


async def toggle_pipeline(
    db: AsyncSession,
    pipeline_id: int,
    status: int,
    updated_by: str | None = None,
) -> UcpPipelineConfig:
    """启用或停用流水线。"""
    pl = await db.get(UcpPipelineConfig, pipeline_id)
    if pl is None:
        raise RuntimeError(f"Pipeline {pipeline_id} not found")

    pl.status = status
    pl.updated_by = updated_by
    await db.flush()

    # 如果停用，也需要停用关联的调度任务
    if status == 2:
        try:
            from app.scheduler.service import disable_job
            # 查找关联的调度任务
            from app.scheduler.models import ScheduledJob
            job = (
                await db.execute(
                    select(ScheduledJob).where(
                        ScheduledJob.kind == "pipeline_run",
                        ScheduledJob.payload["pipeline_code"].as_string() == pl.pipeline_code,
                    )
                )
            ).scalar_one_or_none()
            if job:
                await disable_job(db, job.id)
                logger.info("[ucp] scheduler job disabled for pipeline: code=%s job_id=%d",
                             pl.pipeline_code, job.id)
        except Exception as e:
            logger.warning("[ucp] failed to disable scheduler job for pipeline %s: %s",
                           pl.pipeline_code, e)

    logger.info("[ucp] pipeline toggled: code=%s status=%d", pl.pipeline_code, status)
    return pl


async def delete_pipeline(
    db: AsyncSession,
    pipeline_id: int,
    deleted_by: str | None = None,
) -> bool:
    """删除流水线配置（物理删除）。"""
    pl = await db.get(UcpPipelineConfig, pipeline_id)
    if pl is None:
        return False
    await db.delete(pl)
    await db.flush()
    logger.info("[ucp] pipeline deleted: code=%s by=%s", pl.pipeline_code, deleted_by)
    return True


# ===== 配置版本 =====

async def _save_config_version(
    db: AsyncSession,
    resource_code: str,
    version: int,
    system_config: UcpSystemConfig,
    change_reason: str,
    changed_by: str | None = None,
) -> UcpConfigVersion:
    """保存系统配置版本快照。"""
    snapshot = {
        "system_code": system_config.system_code,
        "system_name": system_config.system_name,
        "adapter_type": system_config.adapter_type,
        "direction": system_config.direction,
        "description": system_config.description,
        "adapter_code": system_config.adapter_code,
        "protocol": system_config.protocol,
        "credential_id": system_config.credential_id,
        "report_config": system_config.report_config,
        "scheduling": system_config.scheduling,
        "mapping_config": system_config.mapping_config,
        "retry_config": system_config.retry_config,
        "notification_config": system_config.notification_config,
        "run_as_type": system_config.run_as_type,
        "service_account_code": system_config.service_account_code,
        "status": system_config.status,
    }
    cv = UcpConfigVersion(
        resource_code=resource_code,
        version=version,
        config_snapshot=snapshot,
        change_reason=change_reason,
        changed_by=changed_by,
    )
    db.add(cv)
    await db.flush()
    return cv


async def list_config_versions(
    db: AsyncSession,
    resource_code: str,
    limit: int = 20,
) -> list[UcpConfigVersion]:
    """查询系统配置版本历史。"""
    stmt = (
        select(UcpConfigVersion)
        .where(UcpConfigVersion.resource_code == resource_code)
        .order_by(desc(UcpConfigVersion.version))
        .limit(limit)
    )
    return (await db.execute(stmt)).scalars().all()


async def rollback_system_config(
    db: AsyncSession,
    config_id: int,
    target_version: int,
    rolled_back_by: str | None = None,
) -> UcpSystemConfig:
    """回滚系统配置到指定版本。

    回滚后系统进入 NEED_TEST 状态（test_status=NOT_TESTED），需要重新测试才能启用。
    """
    conn = await db.get(UcpSystemConfig, config_id)
    if conn is None:
        raise RuntimeError(f"System {config_id} not found")

    # 查找目标版本快照
    version = (
        await db.execute(
            select(UcpConfigVersion).where(
                UcpConfigVersion.resource_code == conn.system_code,
                UcpConfigVersion.version == target_version,
            )
        )
    ).scalar_one_or_none()
    if version is None:
        raise RuntimeError(f"Version {target_version} not found for system config '{conn.system_code}'")

    # 从快照恢复配置字段
    snapshot = version.config_snapshot
    allowed_restore_fields = {
        "system_name", "description", "adapter_type", "direction",
        "adapter_code", "protocol", "credential_id", "report_config",
        "scheduling", "mapping_config", "retry_config", "notification_config",
        "run_as_type", "service_account_code",
    }
    for key, value in snapshot.items():
        if key in allowed_restore_fields:
            setattr(conn, key, value)

    # 回滚后进入 NEED_TEST 状态
    conn.test_status = "NOT_TESTED"
    conn.test_result = None
    conn.version += 1
    conn.updated_by = rolled_back_by
    await db.flush()

    # 记录回滚版本
    await _save_config_version(
        db, conn.system_code, conn.version, conn,
        f"rollback from v{target_version}",
        rolled_back_by,
    )
    logger.info("[ucp] system config rolled back: code=%s to v%d, now at v%d (NEED_TEST)",
                 conn.system_code, target_version, conn.version)
    return conn
