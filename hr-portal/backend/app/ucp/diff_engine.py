"""Phase 7-C: 差异检测引擎。

基于真实资源快照执行，不生成示例数据，不返回 is_demo。
"""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.ucp.models import UcpDiffJob, UcpDiffRecord


# diff 类型
DIFF_MISSING = "MISSING"        # 源有目标无
DIFF_EXTRA = "EXTRA"            # 源无目标有
DIFF_FIELD_MISMATCH = "FIELD_MISMATCH"  # 字段值不一致
DIFF_MAPPING_ERROR = "MAPPING_ERROR"    # ID 映射异常


async def _read_resource_snapshot(db: AsyncSession, resource_id: int) -> list[dict]:
    """从 UcpResourceSnapshot 读取指定资源最近一次成功的治理用数据。"""
    from app.ucp.models import UcpResourceSnapshot
    from sqlalchemy import desc

    stmt = (
        select(UcpResourceSnapshot)
        .where(UcpResourceSnapshot.resource_id == resource_id)
        .where(UcpResourceSnapshot.data_json.isnot(None))
        .order_by(desc(UcpResourceSnapshot.created_at))
        .limit(1)
    )
    row = (await db.execute(stmt)).scalars().first()
    if row and row.data_json:
        return row.data_json
    return []



async def list_diff_jobs(db: AsyncSession) -> list[dict]:
    rows = (await db.execute(select(UcpDiffJob))).scalars().all()
    return [_serialize_job(r) for r in rows]


async def create_diff_job(
    db: AsyncSession,
    job_code: str, job_name: str,
    source_system: str, target_system: str,
    object_type: str,
    compare_fields: list | None = None,
    key_field: str = "id",
    source_resource_id: int | None = None,
    target_resource_id: int | None = None,
    cron_expression: str | None = None,
    created_by: str | None = None,
) -> dict:
    existing = (await db.execute(
        select(UcpDiffJob).where(UcpDiffJob.job_code == job_code)
    )).scalar_one_or_none()
    if existing:
        raise ValueError(f"差异检测任务 '{job_code}' 已存在")

    job = UcpDiffJob(
        job_code=job_code, job_name=job_name,
        source_system=source_system, target_system=target_system,
        object_type=object_type, compare_fields=compare_fields or [],
        key_field=key_field, source_resource_id=source_resource_id,
        target_resource_id=target_resource_id,
        cron_expression=cron_expression,
        is_scheduled=1 if cron_expression else 0,
        created_by=created_by,
    )
    db.add(job)
    await db.flush()
    return _serialize_job(job)


async def update_diff_job(db: AsyncSession, job_id: int, **fields) -> dict:
    job = await db.get(UcpDiffJob, job_id)
    if not job:
        raise ValueError(f"差异检测任务 #{job_id} 不存在")
    allowed = {"job_name", "compare_fields", "cron_expression",
               "is_scheduled", "is_active", "source_system", "target_system",
               "source_resource_id", "target_resource_id", "object_type", "key_field"}
    for k, v in fields.items():
        if k in allowed and hasattr(job, k):
            setattr(job, k, v)
    # 保持 is_scheduled 与 cron_expression 一致
    if "cron_expression" in fields:
        job.is_scheduled = 1 if fields["cron_expression"] else 0
    await db.flush()
    return _serialize_job(job)


async def delete_diff_job(db: AsyncSession, job_id: int) -> bool:
    job = await db.get(UcpDiffJob, job_id)
    if not job:
        raise ValueError(f"差异检测任务 #{job_id} 不存在")
    await db.delete(job)
    return True


async def run_diff_job(
    db: AsyncSession,
    job_id: int,
) -> dict:
    """执行差异检测（Phase 7-C）。

    从 source_resource_id / target_resource_id 绑定的资源最近一次
    流水线执行快照中读取真实数据进行比对。
    不再使用示例数据。
    """
    from app.ucp.models import UcpPipelineStepExecution, UcpResource

    job = await db.get(UcpDiffJob, job_id)
    if not job:
        raise ValueError(f"差异检测任务 #{job_id} 不存在")

    if not job.source_resource_id or not job.target_resource_id:
        raise ValueError(
            "差异检测任务未绑定数据源。请先配置 source_resource_id 和 target_resource_id。"
        )

    ts = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
    run_code = f"DIFF-{job.job_code}-{ts}"
    key_field = job.key_field or "id"
    compare_fields = job.compare_fields or []

    # 从流水线执行快照读取真实数据
    source_data = await _read_resource_snapshot(db, job.source_resource_id)
    target_data = await _read_resource_snapshot(db, job.target_resource_id)

    if not source_data:
        raise ValueError(
            f"源资源 #{job.source_resource_id} 无可用数据。请先通过流水线执行该资源以生成快照。"
        )
    if not target_data:
        raise ValueError(
            f"目标资源 #{job.target_resource_id} 无可用数据。请先通过流水线执行该资源以生成快照。"
        )

    # 按 key_field 构建索引 map
    source_map: dict[str, dict] = {}
    dup_keys: set[str] = set()
    for row in source_data:
        if not isinstance(row, dict) or key_field not in row or row[key_field] is None:
            continue
        k = str(row[key_field])
        if k in source_map:
            dup_keys.add(k)
        source_map[k] = row

    target_map: dict[str, dict] = {}
    for row in target_data:
        if not isinstance(row, dict) or key_field not in row or row[key_field] is None:
            continue
        k = str(row[key_field])
        if k in target_map:
            dup_keys.add(k)
        target_map[k] = row

    if not source_map:
        raise ValueError(f"源数据缺少关键字段 '{key_field}'，请检查资源输出格式。")
    if not target_map:
        raise ValueError(f"目标数据缺少关键字段 '{key_field}'，请检查资源输出格式。")

    records: list[UcpDiffRecord] = []
    stats: dict[str, int] = {"missing": 0, "extra": 0, "field_mismatch": 0, "mapping_error": 0, "total": 0}

    # 主键重复 → MAPPING_ERROR 记录
    for dk in dup_keys:
        records.append(_make_record(job_id, run_code, dk, dk, DIFF_MAPPING_ERROR,
                                     {"reason": "duplicate_key", "key_field": key_field}))
        stats["mapping_error"] += 1

    # MISSING: 源有目标无
    for key in source_map:
        if key not in target_map:
            records.append(_make_record(job_id, run_code, key,
                source_map[key].get("name", key), DIFF_MISSING,
                {"source": source_map[key]}))
            stats["missing"] += 1

    # EXTRA: 源无目标有
    for key in target_map:
        if key not in source_map:
            records.append(_make_record(job_id, run_code, key,
                target_map[key].get("name", key), DIFF_EXTRA,
                {"target": target_map[key]}))
            stats["extra"] += 1

    # FIELD_MISMATCH: 两边都有但字段值不同
    for key in set(source_map) & set(target_map):
        diffs = {}
        for field in compare_fields:
            sv = source_map[key].get(field)
            tv = target_map[key].get(field)
            if _values_differ(sv, tv):
                diffs[field] = {"source_value": sv, "target_value": tv}
        if diffs:
            records.append(_make_record(job_id, run_code, key,
                source_map[key].get("name", key), DIFF_FIELD_MISMATCH, diffs))
            stats["field_mismatch"] += 1

    stats["total"] = stats["missing"] + stats["extra"] + stats["field_mismatch"] + stats["mapping_error"]

    # 批量写入
    for rec in records:
        db.add(rec)
    job.last_run_at = datetime.now(timezone.utc)
    job.last_run_status = "COMPLETED"
    await db.flush()

    return {"run_code": run_code, "stats": stats, "record_count": len(records),
            "source_resource_id": job.source_resource_id,
            "target_resource_id": job.target_resource_id}


async def list_diff_records(
    db: AsyncSession,
    job_id: int | None = None,
    run_code: str | None = None,
    diff_type: str | None = None,
    process_status: str | None = None,
    limit: int = 100,
    offset: int = 0,
) -> list[dict]:
    stmt = select(UcpDiffRecord)
    if job_id:
        stmt = stmt.where(UcpDiffRecord.job_id == job_id)
    if run_code:
        stmt = stmt.where(UcpDiffRecord.run_code == run_code)
    if diff_type:
        stmt = stmt.where(UcpDiffRecord.diff_type == diff_type)
    if process_status:
        stmt = stmt.where(UcpDiffRecord.process_status == process_status)
    stmt = stmt.order_by(desc(UcpDiffRecord.created_at)).offset(offset).limit(limit)
    rows = (await db.execute(stmt)).scalars().all()
    return [_serialize_record(r) for r in rows]


async def get_diff_trend(db: AsyncSession, days: int = 30) -> list[dict]:
    """差异数量随时间变化趋势。"""
    from datetime import timedelta
    since = datetime.now(timezone.utc) - timedelta(days=days)
    from sqlalchemy import func as sa_func, cast, Date
    rows = (await db.execute(
        select(
            cast(UcpDiffRecord.created_at, Date).label("day"),
            sa_func.count(UcpDiffRecord.id).label("cnt"),
        )
        .where(UcpDiffRecord.created_at >= since)
        .group_by("day")
        .order_by("day")
    )).all()
    return [{"date": str(r.day), "count": r.cnt} for r in rows]


def _values_differ(a, b) -> bool:
    """安全比较两个值是否不同，正确处理 None 类型混淆。"""
    if a is None and b is None:
        return False
    if a is None or b is None:
        return True  # 一个是 None 另一个不是 → 不同
    if isinstance(a, bool) or isinstance(b, bool):
        return a is not b
    if isinstance(a, (int, float)) and isinstance(b, (int, float)):
        return a != b
    return str(a) != str(b)


def _make_record(job_id: int, run_code: str, obj_key: str, obj_name: str | None,
                 diff_type: str, diff_detail: dict) -> UcpDiffRecord:
    return UcpDiffRecord(
        job_id=job_id, run_code=run_code,
        object_key=obj_key, object_name=obj_name,
        diff_type=diff_type, diff_detail=diff_detail,
        process_status="PENDING",
        suggested_action=_suggest_action(diff_type),
    )


def _suggest_action(diff_type: str) -> str:
    return {
        DIFF_MISSING: "CREATE_IN_TARGET",
        DIFF_EXTRA: "DISABLE_IN_TARGET",
        DIFF_FIELD_MISMATCH: "UPDATE_IN_TARGET",
        DIFF_MAPPING_ERROR: "FIX_MAPPING",
    }.get(diff_type, "MANUAL_REVIEW")


def _serialize_job(j: UcpDiffJob) -> dict:
    return {
        "id": j.id, "job_code": j.job_code, "job_name": j.job_name,
        "source_system": j.source_system, "target_system": j.target_system,
        "source_resource_id": j.source_resource_id,
        "target_resource_id": j.target_resource_id,
        "object_type": j.object_type, "compare_fields": j.compare_fields,
        "key_field": j.key_field, "cron_expression": j.cron_expression,
        "is_scheduled": bool(j.is_scheduled), "is_active": bool(j.is_active),
        "last_run_at": j.last_run_at.isoformat() if j.last_run_at else None,
        "last_run_status": j.last_run_status,
        "created_by": j.created_by,
        "created_at": j.created_at.isoformat() if j.created_at else None,
    }


def _serialize_record(r: UcpDiffRecord) -> dict:
    return {
        "id": r.id, "job_id": r.job_id, "run_code": r.run_code,
        "object_key": r.object_key, "object_name": r.object_name,
        "diff_type": r.diff_type, "diff_detail": r.diff_detail,
        "process_status": r.process_status,
        "suggested_action": r.suggested_action,
        "resolved_at": r.resolved_at.isoformat() if r.resolved_at else None,
        "resolved_by": r.resolved_by,
        "created_at": r.created_at.isoformat() if r.created_at else None,
    }
