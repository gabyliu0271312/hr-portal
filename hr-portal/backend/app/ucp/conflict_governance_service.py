"""Phase 7-E/F: 冲突处理工作台 + 治理流程服务。

统一管理差异冲突、质量冲突、映射冲突，以及治理任务派发和闭环。
"""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import select, desc, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.ucp.models import (
    UcpConflictRecord, UcpGovernanceTask, UcpGovernanceReport,
    UcpDiffRecord, UcpQualityIssue, UcpIdMapping,
)


# ===== 冲突处理工作台 =====

async def list_conflicts(
    db: AsyncSession,
    source_type: str | None = None,
    status: str | None = None,
    object_type: str | None = None,
    limit: int = 100,
    offset: int = 0,
) -> list[dict]:
    stmt = select(UcpConflictRecord)
    if source_type:
        stmt = stmt.where(UcpConflictRecord.source_type == source_type)
    if status:
        stmt = stmt.where(UcpConflictRecord.status == status)
    if object_type:
        stmt = stmt.where(UcpConflictRecord.object_type == object_type)
    stmt = stmt.order_by(desc(UcpConflictRecord.created_at)).offset(offset).limit(limit)
    rows = (await db.execute(stmt)).scalars().all()
    return [_serialize_conflict(r) for r in rows]


async def create_conflict_from_source(
    db: AsyncSession,
    source_type: str, source_id: int,
    object_type: str, object_key: str,
    conflict_type: str,
    conflict_summary: str | None = None,
    conflict_detail: dict | None = None,
    assigned_to: str | None = None,
) -> dict:
    ts = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
    code = f"CFL-{source_type[:3]}-{ts}"

    c = UcpConflictRecord(
        conflict_code=code,
        source_type=source_type, source_id=source_id,
        object_type=object_type, object_key=object_key,
        conflict_type=conflict_type,
        conflict_summary=conflict_summary,
        conflict_detail=conflict_detail,
        assigned_to=assigned_to,
    )
    db.add(c)
    await db.flush()
    return _serialize_conflict(c)


async def resolve_conflict(
    db: AsyncSession,
    conflict_id: int,
    resolution_strategy: str,  # HR_PORTAL_WINS / EXTERNAL_WINS / MANUAL_FIX / IGNORE
    resolution_detail: dict | None = None,
    resolved_by: str | None = None,
) -> dict:
    c = await db.get(UcpConflictRecord, conflict_id)
    if not c:
        raise ValueError(f"冲突 #{conflict_id} 不存在")

    c.status = "RESOLVED"
    c.resolution_strategy = resolution_strategy
    c.resolution_detail = resolution_detail
    c.resolved_by = resolved_by
    c.resolved_at = datetime.now(timezone.utc)
    await db.flush()
    return _serialize_conflict(c)


async def sync_conflicts_from_sources(db: AsyncSession) -> dict:
    """从差异、质量、映射来源同步冲突到统一工作台。"""
    counts = {"diff": 0, "quality": 0, "mapping": 0}

    # 差异冲突
    diff_records = (await db.execute(
        select(UcpDiffRecord).where(
            UcpDiffRecord.process_status == "PENDING",
            UcpDiffRecord.diff_type.in_(["FIELD_MISMATCH", "MAPPING_ERROR"]),
        ).limit(200)
    )).scalars().all()
    for d in diff_records:
        await create_conflict_from_source(
            db, "DIFF", d.id, "ORG", d.object_key,
            d.diff_type, f"差异: {d.diff_type}",
            d.diff_detail,
        )
        counts["diff"] += 1

    # 质量冲突
    quality_issues = (await db.execute(
        select(UcpQualityIssue).where(
            UcpQualityIssue.status == "OPEN",
            UcpQualityIssue.severity.in_(["ERROR", "WARN"]),
        ).limit(200)
    )).scalars().all()
    for q in quality_issues:
        await create_conflict_from_source(
            db, "QUALITY", q.id, q.object_type, q.object_key,
            q.issue_type, f"质量: {q.issue_type} = {q.current_value}",
            {"field": q.field_name, "expected": q.expected_value},
        )
        counts["quality"] += 1

    # 映射冲突
    mapping_conflicts = (await db.execute(
        select(UcpIdMapping).where(UcpIdMapping.is_conflict == 1).limit(200)
    )).scalars().all()
    for m in mapping_conflicts:
        await create_conflict_from_source(
            db, "MAPPING", m.id, m.object_type, m.external_id,
            "MAPPING_CONFLICT", m.conflict_reason or "ID 映射冲突",
            {"hr_id": m.hr_id, "external_id": m.external_id},
        )
        counts["mapping"] += 1

    await db.flush()
    return counts


# ===== 治理任务 =====

async def list_governance_tasks(
    db: AsyncSession,
    status: str | None = None,
    assigned_to: str | None = None,
    priority: str | None = None,
    limit: int = 100,
    offset: int = 0,
) -> list[dict]:
    stmt = select(UcpGovernanceTask)
    if status:
        stmt = stmt.where(UcpGovernanceTask.status == status)
    if assigned_to:
        stmt = stmt.where(UcpGovernanceTask.assigned_to == assigned_to)
    if priority:
        stmt = stmt.where(UcpGovernanceTask.priority == priority)
    stmt = stmt.order_by(desc(UcpGovernanceTask.created_at)).offset(offset).limit(limit)
    rows = (await db.execute(stmt)).scalars().all()
    return [_serialize_task(r) for r in rows]


async def create_governance_task(
    db: AsyncSession,
    task_name: str,
    source_type: str, source_id: int | None,
    object_type: str | None = None,
    object_key: str | None = None,
    system_code: str | None = None,
    priority: str = "MEDIUM",
    assigned_to: str | None = None,
    due_date: datetime | None = None,
    description: str | None = None,
    created_by: str | None = None,
) -> dict:
    ts = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
    task_code = f"GOV-{ts}"

    t = UcpGovernanceTask(
        task_code=task_code, task_name=task_name,
        source_type=source_type, source_id=source_id,
        object_type=object_type, object_key=object_key,
        system_code=system_code,
        priority=priority, assigned_to=assigned_to,
        assigned_by=created_by, due_date=due_date,
        description=description,
    )
    db.add(t)
    await db.flush()
    return _serialize_task(t)


async def update_governance_task_status(
    db: AsyncSession, task_id: int, status: str,
    resolution_note: str | None = None,
    operator: str | None = None,
) -> dict:
    t = await db.get(UcpGovernanceTask, task_id)
    if not t:
        raise ValueError(f"治理任务 #{task_id} 不存在")

    t.status = status
    if status == "DONE":
        t.completed_at = datetime.now(timezone.utc)
        t.verified_by = operator
        t.resolution_note = resolution_note
    await db.flush()
    return _serialize_task(t)


async def assign_governance_task(
    db: AsyncSession, task_id: int, assigned_to: str,
    assigned_by: str | None = None,
) -> dict:
    t = await db.get(UcpGovernanceTask, task_id)
    if not t:
        raise ValueError(f"治理任务 #{task_id} 不存在")
    t.assigned_to = assigned_to
    t.assigned_by = assigned_by
    t.status = "IN_PROGRESS" if t.status == "TODO" else t.status
    await db.flush()
    return _serialize_task(t)


async def generate_governance_report(
    db: AsyncSession,
    report_period: str | None = None,
) -> dict:
    """生成治理闭环报表。"""
    if not report_period:
        now = datetime.now(timezone.utc)
        report_period = now.strftime("%Y-W%W")

    # 按系统统计
    rows = (await db.execute(
        select(
            UcpGovernanceTask.system_code,
            func.count(UcpGovernanceTask.id).label("total"),
            func.sum(
                func.case((UcpGovernanceTask.status == "DONE", 1), else_=0)
            ).label("resolved"),
            func.sum(
                func.case((UcpGovernanceTask.status == "OVERDUE", 1), else_=0)
            ).label("overdue"),
        )
        .group_by(UcpGovernanceTask.system_code)
    )).all()

    report_items = []
    for r in rows:
        total = r.total or 0
        resolved = r.resolved or 0
        overdue = r.overdue or 0
        closure_rate = resolved / total if total > 0 else 0

        report = UcpGovernanceReport(
            report_period=report_period,
            system_code=r.system_code,
            total_issues=total,
            resolved_issues=resolved,
            open_issues=total - resolved - overdue,
            overdue_issues=overdue,
            closure_rate=closure_rate,
        )
        db.add(report)
        report_items.append({
            "system_code": r.system_code, "total": total,
            "resolved": resolved, "overdue": overdue,
            "closure_rate": round(closure_rate, 4),
        })

    await db.flush()
    return {
        "report_period": report_period,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "items": report_items,
        "summary": {
            "total_systems": len(report_items),
            "total_issues": sum(i["total"] for i in report_items),
            "total_resolved": sum(i["resolved"] for i in report_items),
            "overall_closure_rate": round(
                sum(i["resolved"] for i in report_items) / max(sum(i["total"] for i in report_items), 1), 4
            ),
        },
    }


def _serialize_conflict(c: UcpConflictRecord) -> dict:
    return {
        "id": c.id, "conflict_code": c.conflict_code,
        "source_type": c.source_type, "source_id": c.source_id,
        "object_type": c.object_type, "object_key": c.object_key,
        "object_name": c.object_name,
        "conflict_type": c.conflict_type, "conflict_summary": c.conflict_summary,
        "conflict_detail": c.conflict_detail,
        "resolution_strategy": c.resolution_strategy,
        "resolution_detail": c.resolution_detail,
        "status": c.status,
        "affected_assets": c.affected_assets,
        "assigned_to": c.assigned_to,
        "resolved_by": c.resolved_by,
        "resolved_at": c.resolved_at.isoformat() if c.resolved_at else None,
        "created_at": c.created_at.isoformat() if c.created_at else None,
    }


def _serialize_task(t: UcpGovernanceTask) -> dict:
    return {
        "id": t.id, "task_code": t.task_code, "task_name": t.task_name,
        "source_type": t.source_type, "source_id": t.source_id,
        "object_type": t.object_type, "object_key": t.object_key,
        "system_code": t.system_code,
        "status": t.status, "priority": t.priority,
        "assigned_to": t.assigned_to, "assigned_by": t.assigned_by,
        "due_date": t.due_date.isoformat() if t.due_date else None,
        "description": t.description, "resolution_note": t.resolution_note,
        "verified_by": t.verified_by,
        "verified_at": t.verified_at.isoformat() if t.verified_at else None,
        "created_at": t.created_at.isoformat() if t.created_at else None,
        "completed_at": t.completed_at.isoformat() if t.completed_at else None,
    }
