"""Safe legacy-adapter migration planning; never mutates resources automatically."""
from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ucp.change_service import create_change
from app.ucp.models import UcpChangeRequest, UcpPipelineConfig, UcpResource


class MigrationError(ValueError):
    pass


async def preview_adapter_migration(db: AsyncSession, legacy_adapter_codes: list[str], target_adapter_code: str) -> dict[str, Any]:
    if not legacy_adapter_codes or not target_adapter_code:
        raise MigrationError("legacy_adapter_codes and target_adapter_code are required")
    resources = list((await db.execute(select(UcpResource).where(UcpResource.adapter_code.in_(legacy_adapter_codes)))).scalars())
    pipelines = list((await db.execute(select(UcpPipelineConfig))).scalars())
    items = []
    for resource in resources:
        impacted = [pipeline.pipeline_code for pipeline in pipelines if any(
            step.get("resource_id") == resource.id or step.get("resource_code") == resource.resource_code
            for step in (pipeline.steps or []) if isinstance(step, dict)
        )]
        items.append({"resource_id": resource.id, "resource_code": resource.resource_code,
                      "current_adapter_code": resource.adapter_code, "target_adapter_code": target_adapter_code,
                      "impacted_pipelines": impacted, "requires_confirmation": True})
    return {"total": len(items), "items": items, "auto_execute": False}


async def create_migration_change(db: AsyncSession, resource_id: int, target_adapter_code: str, operator: str | None = None) -> dict:
    resource = await db.get(UcpResource, resource_id)
    if not resource:
        raise MigrationError("resource not found")
    if resource.adapter_code == target_adapter_code:
        raise MigrationError("resource already uses target adapter")
    change = await create_change(
        db, change_type="RESOURCE", change_target_id=resource.id, change_target_code=resource.resource_code,
        change_summary=f"迁移 Adapter: {resource.adapter_code} -> {target_adapter_code}", risk_level="HIGH",
        reason="迁移助手仅创建变更单；审批发布后由受控运维执行", created_by=operator,
    )
    persisted_change = await db.get(UcpChangeRequest, change["id"])
    if not persisted_change:
        raise MigrationError("migration change was not persisted")
    persisted_change.status = "DRAFT"
    persisted_change.after_snapshot = {"adapter_code": target_adapter_code}
    await db.flush()
    change["status"] = "DRAFT"
    change["target_adapter_code"] = target_adapter_code
    return change


async def publish_migration(db: AsyncSession, change_id: int) -> dict:
    from app.ucp.change_service import update_change_status
    change = await db.get(UcpChangeRequest, change_id)
    if not change or change.change_type != "RESOURCE":
        raise MigrationError("migration change not found")
    if change.status not in {"DRAFT", "APPROVED"}:
        raise MigrationError("migration change is not approved for publish")
    resource = await db.get(UcpResource, change.change_target_id)
    if not resource:
        raise MigrationError("resource not found")
    target_adapter_code = (change.after_snapshot or {}).get("adapter_code")
    if not isinstance(target_adapter_code, str) or not target_adapter_code:
        raise MigrationError("migration target adapter is missing")
    resource.adapter_code = target_adapter_code
    return await update_change_status(db, change_id, "PUBLISHED")
