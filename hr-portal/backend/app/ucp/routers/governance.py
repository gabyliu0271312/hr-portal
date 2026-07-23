"""UCP 差异检测 / 数据质量 / 主数据 / 冲突 / 治理任务 / 评分 路由"""
from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import current_user, require_op
from app.core.db import get_session
from app.users.models import User
from app.ucp.diff_engine import (
    list_diff_jobs,
    create_diff_job,
    update_diff_job,
    delete_diff_job,
    run_diff_job,
    list_diff_records,
    get_diff_trend,
)
from app.ucp.quality_rule_service import (
    list_quality_rules,
    create_quality_rule,
    update_quality_rule,
    delete_quality_rule,
    scan_quality,
    list_quality_issues,
)
from app.ucp.master_data_service import (
    list_master_data_objects,
    create_master_data_object,
    update_master_data_object,
    list_id_mappings,
    create_id_mapping,
    update_id_mapping,
    delete_id_mapping,
    check_mapping_conflicts,
)
from app.ucp.conflict_governance_service import (
    sync_conflicts_from_sources,
    list_conflicts,
    resolve_conflict,
    list_governance_tasks,
    create_governance_task,
    update_governance_task_status,
    generate_governance_report,
)
from app.ucp.governance_score_service import (
    calculate_scores,
    get_latest_scores,
)

logger = logging.getLogger("ucp.routers.governance")
router = APIRouter()


# ── Diff Jobs ──

@router.get("/diff/jobs")
async def route_list_diff_jobs(
    db: AsyncSession = Depends(get_session),
    _user: User = Depends(require_op("ucp.governance", "V")),
):
    items = await list_diff_jobs(db)
    return {"items": items}


@router.post("/diff/jobs")
async def route_create_diff_job(
    payload: dict[str, Any],
    db: AsyncSession = Depends(get_session),
    user: User = Depends(require_op("ucp.governance", "C")),
):
    job = await create_diff_job(
        db,
        job_code=payload["job_code"],
        job_name=payload["job_name"],
        source_system=payload["source_system"],
        target_system=payload["target_system"],
        object_type=payload["object_type"],
        compare_fields=payload.get("compare_fields"),
        key_field=payload.get("key_field"),
        source_resource_id=payload.get("source_resource_id"),
        target_resource_id=payload.get("target_resource_id"),
        cron_expression=payload.get("cron_expression"),
    )
    await db.commit()
    return job


@router.patch("/diff/jobs/{job_id}")
async def route_update_diff_job(
    job_id: int,
    payload: dict[str, Any],
    db: AsyncSession = Depends(get_session),
    _user: User = Depends(require_op("ucp.governance", "U")),
):
    job = await update_diff_job(db, job_id, **payload)
    await db.commit()
    return job


@router.delete("/diff/jobs/{job_id}")
async def route_delete_diff_job(
    job_id: int,
    db: AsyncSession = Depends(get_session),
    _user: User = Depends(require_op("ucp.governance", "D")),
):
    ok = await delete_diff_job(db, job_id)
    if not ok:
        raise HTTPException(404, "差异检测任务不存在")
    return {"deleted": True}


@router.post("/diff/jobs/{job_id}/run")
async def route_run_diff_job(
    job_id: int,
    db: AsyncSession = Depends(get_session),
    _user: User = Depends(require_op("ucp.governance", "U")),
):
    result = await run_diff_job(db, job_id)
    await db.commit()
    return result


@router.get("/diff/records")
async def route_list_diff_records(
    job_id: int | None = Query(None),
    run_code: str | None = Query(None),
    diff_type: str | None = Query(None),
    process_status: str | None = Query(None),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_session),
    _user: User = Depends(require_op("ucp.governance", "V")),
):
    items = await list_diff_records(db, job_id=job_id, run_code=run_code, diff_type=diff_type, process_status=process_status, limit=limit, offset=offset)
    return {"total": len(items), "items": items}


@router.get("/diff/trend")
async def route_diff_trend(
    days: int = Query(30, ge=1, le=365),
    db: AsyncSession = Depends(get_session),
    _user: User = Depends(require_op("ucp.governance", "V")),
):
    items = await get_diff_trend(db, days=days)
    return {"items": items}


# ── Quality Rules ──

@router.get("/quality/rules")
async def route_list_quality_rules(
    rule_type: str | None = Query(None),
    object_type: str | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_session),
    _user: User = Depends(require_op("ucp.governance", "V")),
):
    items = await list_quality_rules(db, rule_type=rule_type, object_type=object_type, limit=limit)
    return {"total": len(items), "items": items}


@router.post("/quality/rules")
async def route_create_quality_rule(
    payload: dict[str, Any],
    db: AsyncSession = Depends(get_session),
    user: User = Depends(require_op("ucp.governance", "C")),
):
    rule = await create_quality_rule(
        db,
        rule_code=payload["rule_code"],
        rule_name=payload["rule_name"],
        object_type=payload["object_type"],
        rule_type=payload["rule_type"],
        resource_id=payload.get("resource_id"),
        system_code=payload.get("system_code"),
        field_name=payload.get("field_name"),
        rule_config=payload.get("rule_config"),
        severity=payload.get("severity", "WARNING"),
        cron_expression=payload.get("cron_expression"),
        description=payload.get("description"),
    )
    await db.commit()
    return rule


@router.patch("/quality/rules/{rule_id}")
async def route_update_quality_rule(
    rule_id: int,
    payload: dict[str, Any],
    db: AsyncSession = Depends(get_session),
    _user: User = Depends(require_op("ucp.governance", "U")),
):
    rule = await update_quality_rule(db, rule_id, **payload)
    await db.commit()
    return rule


@router.delete("/quality/rules/{rule_id}")
async def route_delete_quality_rule(
    rule_id: int,
    db: AsyncSession = Depends(get_session),
    _user: User = Depends(require_op("ucp.governance", "D")),
):
    ok = await delete_quality_rule(db, rule_id)
    if not ok:
        raise HTTPException(404, "质量规则不存在")
    return {"deleted": True}


@router.post("/quality/rules/{rule_id}/scan")
async def route_scan_quality(
    rule_id: int,
    db: AsyncSession = Depends(get_session),
    _user: User = Depends(require_op("ucp.governance", "U")),
):
    result = await scan_quality(db, rule_id)
    await db.commit()
    return result


@router.get("/quality/issues")
async def route_list_quality_issues(
    rule_id: int | None = Query(None),
    scan_run_code: str | None = Query(None),
    status: str | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_session),
    _user: User = Depends(require_op("ucp.governance", "V")),
):
    items = await list_quality_issues(db, rule_id=rule_id, scan_run_code=scan_run_code, status=status, limit=limit)
    return {"total": len(items), "items": items}


# ── Master Data ──

@router.get("/master-data/objects")
async def route_list_master_data_objects(
    object_type: str | None = Query(None),
    system_code: str | None = Query(None),
    keyword: str | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_session),
    _user: User = Depends(require_op("ucp.governance", "V")),
):
    items = await list_master_data_objects(db, object_type=object_type, system_code=system_code, keyword=keyword, limit=limit, offset=offset)
    return {"total": len(items), "items": items}


@router.post("/master-data/objects")
async def route_create_master_data_object(
    payload: dict[str, Any],
    db: AsyncSession = Depends(get_session),
    user: User = Depends(require_op("ucp.governance", "C")),
):
    obj = await create_master_data_object(
        db,
        object_code=payload["object_code"],
        object_name=payload["object_name"],
        object_type=payload.get("object_type", "CUSTOM"),
        system_code=payload.get("system_code"),
        resource_id=payload.get("resource_id"),
        attributes=payload.get("attributes"),
        description=payload.get("description"),
        created_by=user.login_name,
    )
    await db.commit()
    return obj


@router.patch("/master-data/objects/{code}")
async def route_update_master_data_object(
    code: str,
    payload: dict[str, Any],
    db: AsyncSession = Depends(get_session),
    _user: User = Depends(require_op("ucp.governance", "U")),
):
    obj = await update_master_data_object(db, code, **payload)
    await db.commit()
    return obj


@router.get("/master-data/mappings")
async def route_list_id_mappings(
    object_type: str | None = Query(None),
    external_system: str | None = Query(None),
    hr_id: str | None = Query(None),
    is_conflict: bool | None = Query(None),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_session),
    _user: User = Depends(require_op("ucp.governance", "V")),
):
    items = await list_id_mappings(db, object_type=object_type, external_system=external_system, hr_id=hr_id, is_conflict=is_conflict, limit=limit, offset=offset)
    return {"total": len(items), "items": items}


@router.post("/master-data/mappings")
async def route_create_id_mapping(
    payload: dict[str, Any],
    db: AsyncSession = Depends(get_session),
    user: User = Depends(require_op("ucp.governance", "C")),
):
    mapping = await create_id_mapping(
        db,
        object_type=payload["object_type"],
        hr_id=payload["hr_id"],
        external_system=payload["external_system"],
        external_id=payload["external_id"],
        external_name=payload.get("external_name"),
        mapping_type=payload.get("mapping_type", "ONE_TO_ONE"),
        created_by=user.login_name,
    )
    await db.commit()
    return mapping


@router.patch("/master-data/mappings/{id}")
async def route_update_id_mapping(
    id: int,
    payload: dict[str, Any],
    db: AsyncSession = Depends(get_session),
    _user: User = Depends(require_op("ucp.governance", "U")),
):
    mapping = await update_id_mapping(db, id, **payload)
    await db.commit()
    return mapping


@router.delete("/master-data/mappings/{id}")
async def route_delete_id_mapping(
    id: int,
    db: AsyncSession = Depends(get_session),
    _user: User = Depends(require_op("ucp.governance", "D")),
):
    ok = await delete_id_mapping(db, id)
    if not ok:
        raise HTTPException(404, "ID映射不存在")
    return {"deleted": True}


@router.post("/master-data/mappings/check-conflicts")
async def route_check_mapping_conflicts(
    db: AsyncSession = Depends(get_session),
    _user: User = Depends(require_op("ucp.governance", "V")),
):
    conflicts = await check_mapping_conflicts(db)
    return {"total": len(conflicts), "conflicts": conflicts}


# ── Conflicts ──

@router.post("/conflicts/sync")
async def route_sync_conflicts(
    db: AsyncSession = Depends(get_session),
    _user: User = Depends(require_op("ucp.governance", "U")),
):
    result = await sync_conflicts_from_sources(db)
    await db.commit()
    return result


@router.get("/conflicts")
async def route_list_conflicts(
    source_type: str | None = Query(None),
    status: str | None = Query(None),
    object_type: str | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_session),
    _user: User = Depends(require_op("ucp.governance", "V")),
):
    items = await list_conflicts(db, source_type=source_type, status=status, object_type=object_type, limit=limit, offset=offset)
    return {"total": len(items), "items": items}


@router.post("/conflicts/{id}/resolve")
async def route_resolve_conflict(
    id: int,
    payload: dict[str, Any],
    db: AsyncSession = Depends(get_session),
    _user: User = Depends(require_op("ucp.governance", "U")),
):
    result = await resolve_conflict(
        db,
        conflict_id=id,
        resolution_strategy=payload["resolution_strategy"],
        resolution_detail=payload.get("resolution_detail"),
    )
    await db.commit()
    return result


# ── Governance Tasks ──

@router.get("/governance/tasks")
async def route_list_governance_tasks(
    status: str | None = Query(None),
    assigned_to: str | None = Query(None),
    priority: str | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_session),
    _user: User = Depends(require_op("ucp.governance", "V")),
):
    items = await list_governance_tasks(db, status=status, assigned_to=assigned_to, priority=priority, limit=limit, offset=offset)
    return {"total": len(items), "items": items}


@router.post("/governance/tasks")
async def route_create_governance_task(
    payload: dict[str, Any],
    db: AsyncSession = Depends(get_session),
    user: User = Depends(require_op("ucp.governance", "C")),
):
    task = await create_governance_task(
        db,
        task_name=payload["task_name"],
        source_type=payload.get("source_type", "MANUAL"),
        source_id=payload.get("source_id"),
        object_type=payload.get("object_type"),
        object_key=payload.get("object_key"),
        system_code=payload.get("system_code"),
        priority=payload.get("priority", "MEDIUM"),
        assigned_to=payload.get("assigned_to"),
        due_date=payload.get("due_date"),
        description=payload.get("description"),
        created_by=user.login_name,
    )
    await db.commit()
    return task


@router.patch("/governance/tasks/{id}")
async def route_update_governance_task(
    id: int,
    payload: dict[str, Any],
    db: AsyncSession = Depends(get_session),
    _user: User = Depends(require_op("ucp.governance", "U")),
):
    task = await update_governance_task_status(db, id, **payload)
    await db.commit()
    return task


# ── Governance Reports ──

@router.post("/governance/reports/generate")
async def route_generate_governance_report(
    payload: dict[str, Any] = {},
    db: AsyncSession = Depends(get_session),
    _user: User = Depends(require_op("ucp.governance", "C")),
):
    report = await generate_governance_report(db, report_period=payload.get("report_period", "MONTHLY"))
    await db.commit()
    return report


# ── Scores ──

@router.post("/governance/scores/calculate")
async def route_calculate_scores(
    asset_type: str | None = Query(None),
    window_hours: int | None = Query(None),
    db: AsyncSession = Depends(get_session),
    _user: User = Depends(require_op("ucp.governance", "U")),
):
    items = await calculate_scores(db, asset_type=asset_type, window_hours=window_hours)
    await db.commit()
    return {"items": items}


@router.get("/governance/scores")
async def route_list_scores(
    asset_type: str | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_session),
    _user: User = Depends(require_op("ucp.governance", "V")),
):
    items = await get_latest_scores(db, asset_type=asset_type, limit=limit)
    return {"items": items}
