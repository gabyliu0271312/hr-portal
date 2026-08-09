"""Mapping Service

管理规则集目录、版本、绑定、发布审计、依赖和重算。
不复制 ODS→DWD 规则正文。
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy import select, update, func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.mapping.models import (
    MappingRuleSetCatalog,
    MappingRuleSetVersion,
    MappingBinding,
    MappingDependency,
    MappingPublishAudit,
    MappingRebuildRun,
)
from app.mapping.errors import MappingException, MappingErrorCode, conflict_error
from app.mapping.dto import MappingCompatibilityV1


class MappingService:
    """映射元数据服务"""

    def __init__(self, db: AsyncSession):
        self.db = db

    # -- 规则集目录 ----------------------------------------------------------

    async def create_catalog(
        self,
        *,
        code: str,
        name: str,
        description: str | None = None,
        owner: str | None = None,
    ) -> dict[str, Any]:
        catalog = MappingRuleSetCatalog(
            code=code,
            name=name,
            description=description,
            owner=owner,
            status="draft",
            current_version=0,
        )
        self.db.add(catalog)
        await self.db.flush()
        return {"id": catalog.id, "code": catalog.code, "name": catalog.name}

    async def get_catalog_by_code(self, code: str) -> MappingRuleSetCatalog | None:
        result = await self.db.execute(
            select(MappingRuleSetCatalog).where(MappingRuleSetCatalog.code == code)
        )
        return result.scalar_one_or_none()

    # -- 版本 ----------------------------------------------------------------

    async def create_version(
        self,
        *,
        catalog_id: int,
        version: int,
        source_schema_hash: str = "",
        target_schema_hash: str = "",
        adapter: str = "",
        storage_mode: str = "component_v1",
        compatibility_state: dict | None = None,
        standardization_rule_ids: list[int] | None = None,
        caller_config_ref: dict | None = None,
    ) -> MappingRuleSetVersion:
        ver = MappingRuleSetVersion(
            catalog_id=catalog_id,
            version=version,
            status="draft",
            mapping_schema_version=1,
            source_schema_hash=source_schema_hash,
            target_schema_hash=target_schema_hash,
            adapter=adapter,
            storage_mode=storage_mode,
            compatibility_state=compatibility_state,
            standardization_rule_ids=standardization_rule_ids,
            caller_config_ref=caller_config_ref,
        )
        self.db.add(ver)
        await self.db.flush()
        return ver

    async def publish_version(
        self,
        *,
        catalog_id: int,
        version: int,
        published_by: str = "system",
    ) -> MappingRuleSetVersion:
        ver = await self._get_version(catalog_id, version)
        if ver.status == "published":
            raise MappingException(
                MappingErrorCode.MAPPING_VERSION_CONFLICT,
                f"版本 {version} 已发布, 不可重复发布",
                http_status=409,
            )
        ver.status = "published"
        ver.published_by = published_by
        ver.published_at = datetime.utcnow()

        # 更新目录当前版本
        await self.db.execute(
            update(MappingRuleSetCatalog)
            .where(MappingRuleSetCatalog.id == catalog_id)
            .values(current_version=version, status="published")
        )
        await self.db.flush()
        return ver

    async def rollback_version(
        self,
        *,
        catalog_id: int,
        target_version: int,
    ) -> MappingRuleSetVersion:
        """回滚到指定已发布版本"""
        ver = await self._get_version(catalog_id, target_version)
        if ver.status != "published":
            raise MappingException(
                MappingErrorCode.MAPPING_VERSION_CONFLICT,
                f"版本 {target_version} 未发布, 无法回滚",
                http_status=409,
            )
        await self.db.execute(
            update(MappingRuleSetCatalog)
            .where(MappingRuleSetCatalog.id == catalog_id)
            .values(current_version=target_version)
        )
        await self.db.flush()
        return ver

    async def _get_version(self, catalog_id: int, version: int) -> MappingRuleSetVersion:
        result = await self.db.execute(
            select(MappingRuleSetVersion).where(
                MappingRuleSetVersion.catalog_id == catalog_id,
                MappingRuleSetVersion.version == version,
            )
        )
        ver = result.scalar_one_or_none()
        if ver is None:
            raise MappingException(
                MappingErrorCode.MAPPING_VERSION_CONFLICT,
                f"版本 {version} 不存在",
                http_status=404,
            )
        return ver

    # -- 绑定 ----------------------------------------------------------------

    async def get_or_create_binding(
        self,
        *,
        caller: str,
        asset_id: str,
        binding_key: str = "default",
    ) -> MappingBinding:
        result = await self.db.execute(
            select(MappingBinding).where(
                MappingBinding.caller == caller,
                MappingBinding.asset_id == asset_id,
                MappingBinding.binding_key == binding_key,
            )
        )
        binding = result.scalar_one_or_none()
        if binding is None:
            binding = MappingBinding(
                caller=caller,
                asset_id=asset_id,
                binding_key=binding_key,
                version=0,
                expected_version=0,
                storage_mode="component_v1",
            )
            self.db.add(binding)
            await self.db.flush()
        return binding

    async def update_binding_version(
        self,
        *,
        binding_id: int,
        expected_version: int,
        new_version: int,
        storage_mode: str = "component_v1",
    ) -> MappingBinding:
        """乐观锁更新"""
        result = await self.db.execute(
            select(MappingBinding).where(MappingBinding.id == binding_id)
        )
        binding = result.scalar_one_or_none()
        if binding is None:
            raise MappingException(
                MappingErrorCode.MAPPING_VERSION_CONFLICT,
                f"绑定 {binding_id} 不存在",
                http_status=404,
            )

        if binding.expected_version != expected_version:
            raise conflict_error(
                f"版本冲突: 期望 {expected_version}, 实际 {binding.expected_version}"
            )

        binding.version = new_version
        binding.expected_version = new_version
        binding.storage_mode = storage_mode
        await self.db.flush()
        return binding

    # -- 发布 ----------------------------------------------------------------

    async def publish(
        self,
        *,
        binding_id: int,
        expected_version: int,
        actor: str = "system",
    ) -> dict[str, Any]:
        """发布绑定"""
        binding = await self._get_binding(binding_id, for_update=True)

        if binding.expected_version != expected_version:
            raise conflict_error(
                f"版本冲突: 期望 {expected_version}, 实际 {binding.expected_version}"
            )

        # 创建审计记录
        event_id = str(uuid.uuid4())
        idempotency_key = f"publish:{binding_id}:{expected_version}"

        # 检查幂等
        existing = await self.db.execute(
            select(MappingPublishAudit).where(
                MappingPublishAudit.idempotency_key == idempotency_key
            )
        )
        existing_audit = existing.scalar_one_or_none()
        if existing_audit is not None:
            return {
                "status": "already_published",
                "event_id": existing_audit.event_id,
                "binding_id": binding_id,
                "version": existing_audit.mapping_version,
            }

        audit = MappingPublishAudit(
            binding_id=binding_id,
            event_id=event_id,
            idempotency_key=idempotency_key,
            event_type="mapping_rule_set_published",
            mapping_version=expected_version,
            schema_hash="",
            rebuild_policy="manual",
            actor=actor,
            payload={"caller": binding.caller, "asset_id": binding.asset_id},
            occurred_at=datetime.now(timezone.utc).replace(tzinfo=None),
        )

        # 即使上面已经拿到行锁，也使用条件 UPDATE 固化乐观锁合同；这让
        # publish 在非 PostgreSQL 测试替身和未来改动中也不会退化成无条件写。
        version_update = await self.db.execute(
            update(MappingBinding)
            .where(
                MappingBinding.id == binding_id,
                MappingBinding.expected_version == expected_version,
            )
            .values(
                version=expected_version,
                expected_version=expected_version,
            )
        )
        if version_update.rowcount != 1:
            raise conflict_error(
                f"版本冲突: 期望 {expected_version}, 实际版本已发生变化"
            )
        binding.version = expected_version
        binding.expected_version = expected_version

        # 唯一审计键是最终幂等边界。使用 savepoint 捕获唯一冲突，避免
        # 当前请求事务进入 failed 状态；并发请求随后读取已提交的原始事件。
        try:
            async with self.db.begin_nested():
                self.db.add(audit)
                await self.db.flush()
        except IntegrityError as exc:
            constraint_name = getattr(getattr(exc, "orig", None), "diag", None)
            constraint_name = getattr(constraint_name, "constraint_name", None)
            if constraint_name != "uq_mapping_audit_idempotency" and (
                "uq_mapping_audit_idempotency" not in str(exc)
            ):
                raise
            existing = await self.db.execute(
                select(MappingPublishAudit).where(
                    MappingPublishAudit.idempotency_key == idempotency_key
                )
            )
            existing_audit = existing.scalar_one_or_none()
            if existing_audit is None:
                raise conflict_error("发布幂等冲突，原始发布事件暂不可见") from exc
            return {
                "status": "already_published",
                "event_id": existing_audit.event_id,
                "binding_id": binding_id,
                "version": existing_audit.mapping_version,
            }

        from app.ucp.outbox_service import enqueue_event
        await enqueue_event(
            self.db,
            topic="mapping_published",
            dedup_key=f"mapping:{binding_id}:{expected_version}:binding",
            payload={
                "event_id": event_id,
                "event_type": "mapping_rule_set_published",
                "binding_id": binding_id,
                "mapping_version": expected_version,
                "audit_id": audit.id,
                "target_type": "binding",
                "target_id": str(binding_id),
                "caller": binding.caller,
                "asset_id": binding.asset_id,
            },
        )

        return {
            "status": "published",
            "event_id": event_id,
            "binding_id": binding_id,
            "version": expected_version,
        }

    # -- 工资灰度/回滚控制 -----------------------------------------------------

    async def get_wage_rollout(self, *, asset_id: str) -> dict[str, Any]:
        """读取持久化的工资 rollout 控制；没有配置时安全回退 shadow。"""
        result = await self.db.execute(
            select(MappingBinding).where(
                MappingBinding.caller == "warehouse",
                MappingBinding.asset_id == asset_id,
                MappingBinding.binding_key == "wage_rollout",
            )
        )
        binding = result.scalar_one_or_none()
        control = dict((binding.legacy_snapshot or {}).get("wage_rollout") or {}) if binding else {}
        return {
            "binding_id": binding.id if binding else None,
            "expected_version": binding.expected_version if binding else 0,
            "mode": control.get("mode", "shadow"),
            "component_percent": int(control.get("component_percent", 0) or 0),
            "actor": control.get("actor"),
            "audit_id": control.get("audit_id"),
            "event_id": control.get("event_id"),
            "updated_at": control.get("updated_at"),
        }

    async def configure_wage_rollout(
        self,
        *,
        asset_id: str,
        expected_version: int,
        mode: str,
        component_percent: int,
        actor: str = "system",
    ) -> dict[str, Any]:
        """以乐观锁持久化工资灰度或 rollback 开关，并留下脱敏审计。"""
        if mode not in {"shadow", "gray", "rollback"}:
            raise MappingException(
                MappingErrorCode.MAPPING_EFFECT_FORBIDDEN,
                "工资 rollout 模式仅支持 shadow/gray/rollback",
                http_status=422,
            )
        percent = max(0, min(int(component_percent), 100))
        binding = await self.get_or_create_binding(
            caller="warehouse", asset_id=asset_id, binding_key="wage_rollout"
        )
        if binding.expected_version != expected_version:
            raise conflict_error(
                f"版本冲突: 期望 {expected_version}, 实际 {binding.expected_version}"
            )
        new_version = expected_version + 1
        snapshot = dict(binding.legacy_snapshot or {})
        snapshot["wage_rollout"] = {
            "mode": mode,
            "component_percent": percent,
            "actor": actor,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        binding.legacy_snapshot = snapshot
        binding.version = new_version
        binding.expected_version = new_version
        binding.storage_mode = "component_v1" if mode == "gray" and percent > 0 else "legacy"
        audit = MappingPublishAudit(
            binding_id=binding.id,
            event_id=str(uuid.uuid4()),
            idempotency_key=f"wage-rollout:{binding.id}:{new_version}",
            event_type="wage_rollout_changed",
            mapping_version=new_version,
            schema_hash="",
            rebuild_policy="manual",
            actor=actor,
            payload={"asset_id": asset_id, "mode": mode, "component_percent": percent},
            occurred_at=datetime.now(timezone.utc).replace(tzinfo=None),
        )
        self.db.add(audit)
        await self.db.flush()
        snapshot["wage_rollout"]["audit_id"] = audit.id
        snapshot["wage_rollout"]["event_id"] = audit.event_id
        binding.legacy_snapshot = snapshot
        await self.db.flush()
        return {
            "binding_id": binding.id,
            "version": new_version,
            "mode": mode,
            "component_percent": percent,
            "storage_mode": binding.storage_mode,
            "audit_id": audit.id,
        }

    async def record_rebuild_success(
        self,
        *,
        binding_id: int,
        target_id: str,
        row_count: int,
        audit_id: int | None = None,
        event_id: str | None = None,
        mapping_version: int = 0,
    ) -> MappingRebuildRun:
        """记录一次已完成的 DWD 重算；不复制规则正文或工资明细。"""
        now = datetime.utcnow()
        event_key = event_id or f"legacy-rebuild:{binding_id}:{mapping_version}:{target_id}"
        existing = (
            await self.db.execute(
                select(MappingRebuildRun).where(
                    MappingRebuildRun.event_id == event_key,
                    MappingRebuildRun.binding_id == binding_id,
                    MappingRebuildRun.mapping_version == mapping_version,
                    MappingRebuildRun.target_id == target_id,
                )
            )
        ).scalar_one_or_none()
        if existing is not None:
            existing.status = "success"
            existing.audit_id = audit_id or existing.audit_id
            existing.started_at = existing.started_at or now
            existing.completed_at = now
            existing.error_message = None
            await self.db.flush()
            return existing
        run = MappingRebuildRun(
            binding_id=binding_id,
            audit_id=audit_id,
            event_id=event_key,
            mapping_version=mapping_version,
            status="success",
            target_type="dwd",
            target_id=target_id,
            started_at=now,
            completed_at=now,
            error_message=None,
        )
        self.db.add(run)
        await self.db.flush()
        return run

    # -- 依赖 ----------------------------------------------------------------

    async def get_dependencies(self, binding_id: int) -> list[dict[str, Any]]:
        result = await self.db.execute(
            select(MappingDependency).where(MappingDependency.binding_id == binding_id)
        )
        deps = result.scalars().all()
        return [
            {
                "source_type": d.source_type,
                "source_id": d.source_id,
                "target_type": d.target_type,
                "target_id": d.target_id,
                "rebuild_policy": d.rebuild_policy,
            }
            for d in deps
        ]

    async def add_dependency(
        self,
        *,
        binding_id: int,
        source_type: str,
        source_id: str,
        target_type: str,
        target_id: str,
        rebuild_policy: str = "manual",
    ):
        dep = MappingDependency(
            binding_id=binding_id,
            source_type=source_type,
            source_id=source_id,
            target_type=target_type,
            target_id=target_id,
            rebuild_policy=rebuild_policy,
        )
        self.db.add(dep)
        await self.db.flush()
        return dep

    # -- 重算 ----------------------------------------------------------------

    async def rebuild_dependencies(
        self,
        *,
        binding_id: int,
        target_type: str | None = None,
        target_id: str | None = None,
    ) -> dict[str, Any]:
        """触发依赖重算"""
        query = select(MappingDependency).where(
            MappingDependency.binding_id == binding_id
        )
        if target_type:
            query = query.where(MappingDependency.target_type == target_type)
        if target_id:
            query = query.where(MappingDependency.target_id == target_id)

        result = await self.db.execute(query)
        deps = result.scalars().all()

        runs: list[dict] = []
        for dep in deps:
            run = MappingRebuildRun(
                binding_id=binding_id,
                event_id=f"rebuild:{binding_id}:{dep.target_type}:{dep.target_id}",
                mapping_version=0,
                status="pending",
                target_type=dep.target_type,
                target_id=dep.target_id,
                started_at=datetime.utcnow(),
            )
            self.db.add(run)
            await self.db.flush()
            runs.append({"run_id": run.id, "target_type": dep.target_type, "target_id": dep.target_id})

        await self.db.flush()
        return {"status": "triggered", "runs": runs}

    # -- 内部 ----------------------------------------------------------------

    async def _get_binding(
        self, binding_id: int, *, for_update: bool = False
    ) -> MappingBinding:
        query = select(MappingBinding).where(MappingBinding.id == binding_id)
        if for_update:
            query = query.with_for_update()
        result = await self.db.execute(query)
        binding = result.scalar_one_or_none()
        if binding is None:
            raise MappingException(
                MappingErrorCode.MAPPING_VERSION_CONFLICT,
                f"绑定 {binding_id} 不存在",
                http_status=404,
            )
        return binding
