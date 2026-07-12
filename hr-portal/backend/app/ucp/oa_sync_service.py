"""UCP Phase 3-6: OA 组织架构同步 Service

负责组织架构的双向同步 (源=北森, 目标=OA):
  - 拉取源系统组织树 (北森)
  - 拉取目标系统组织树 (OA)
  - 树形 diff: CREATED / UPDATED / DELETED / MOVED / UNCHANGED
  - 处理同步: 高风险动作 (DELETE / MOVE) 走 Phase 3-5 审批
  - 记录每次同步批次与节点差异

设计:
  - 差异比较以 org_code 为 join key
  - UNCHANGED: 所有字段一致
  - CREATED: 源系统有, 目标系统无
  - UPDATED: 字段变化 (name, parent 等)
  - DELETED: 源系统无, 目标系统有 (高风险)
  - MOVED: parent_org_code 变化 (高风险)
  - 每次同步生成一条 oa_sync_run 记录
  - 每个差异节点生成一条 oa_sync_record
"""
from __future__ import annotations

import json
import logging
import secrets
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.ucp.models import (
    OaSyncRun, OaSyncRecord,
    DIFF_CREATED, DIFF_UPDATED, DIFF_DELETED, DIFF_MOVED, DIFF_UNCHANGED,
    PROCESS_PENDING, PROCESS_SYNCED, PROCESS_FAILED, PROCESS_SKIPPED, PROCESS_APPROVAL_PENDING,
    TRIGGER_SCHEDULED, TRIGGER_EVENT, TRIGGER_MANUAL,
    BUSINESS_OA_ORG_DELETE, BUSINESS_OA_ORG_MOVE,
)

logger = logging.getLogger("ucp.oa_sync")


class OaSyncError(Exception):
    """OA 同步错误。"""

    def __init__(self, code: str, message: str):
        self.code = code
        self.message = message
        super().__init__(f"{code}: {message}")


def _gen_run_code() -> str:
    return f"OAR-{datetime.now(timezone.utc).strftime('%Y%m%d')}-{secrets.token_hex(4).upper()}"


# ===== 差异比较核心 =====


def diff_org_trees(
    source_orgs: list[dict],
    target_orgs: list[dict],
) -> list[dict]:
    """对比源 / 目标组织树, 返回差异列表。

    source_orgs / target_orgs 元素格式:
      {
        "org_code": "DEPT-001",
        "org_name": "技术部",
        "parent_org_code": "ROOT" | None,
        "path": "公司/技术部",  # 可选, 用于展示
        "status": "ACTIVE" | "DELETED",
      }

    返回: 每个差异一条记录
      {
        "org_code": ...,
        "org_name": ...,
        "parent_org_code": ...,
        "source": {...} | None,
        "target": {...} | None,
        "diff_type": CREATED / UPDATED / DELETED / MOVED / UNCHANGED,
        "diff_detail": {field: [old, new], ...},
      }
    """
    src_map = {o["org_code"]: o for o in source_orgs}
    tgt_map = {o["org_code"]: o for o in target_orgs}

    all_codes = set(src_map.keys()) | set(tgt_map.keys())
    diffs = []

    for code in sorted(all_codes):
        src = src_map.get(code)
        tgt = tgt_map.get(code)

        if src and not tgt:
            # 源有目标无 → CREATED
            diffs.append({
                "org_code": code,
                "org_name": src.get("org_name", code),
                "parent_org_code": src.get("parent_org_code"),
                "source": src,
                "target": None,
                "diff_type": DIFF_CREATED,
                "diff_detail": None,
            })
        elif tgt and not src:
            # 源无目标有 → DELETED (高风险)
            diffs.append({
                "org_code": code,
                "org_name": tgt.get("org_name", code),
                "parent_org_code": tgt.get("parent_org_code"),
                "source": None,
                "target": tgt,
                "diff_type": DIFF_DELETED,
                "diff_detail": None,
            })
        else:
            # 双方都有 → 比较字段
            assert src and tgt
            field_diffs = {}

            # 关键字段
            for field in ["org_name", "parent_org_code", "status"]:
                src_val = src.get(field)
                tgt_val = tgt.get(field)
                if src_val != tgt_val:
                    # parent_org_code 变化是 MOVED
                    if field == "parent_org_code" and src_val is not None and tgt_val is not None:
                        # 移动
                        pass
                    field_diffs[field] = {"old": tgt_val, "new": src_val}

            if not field_diffs:
                diffs.append({
                    "org_code": code,
                    "org_name": src.get("org_name", code),
                    "parent_org_code": src.get("parent_org_code"),
                    "source": src,
                    "target": tgt,
                    "diff_type": DIFF_UNCHANGED,
                    "diff_detail": None,
                })
            else:
                # parent 变化优先归类为 MOVED
                if "parent_org_code" in field_diffs:
                    diff_type = DIFF_MOVED
                else:
                    diff_type = DIFF_UPDATED

                diffs.append({
                    "org_code": code,
                    "org_name": src.get("org_name", code),
                    "parent_org_code": src.get("parent_org_code"),
                    "source": src,
                    "target": tgt,
                    "diff_type": diff_type,
                    "diff_detail": field_diffs,
                })

    return diffs


# ===== 同步批次管理 =====


async def create_run(
    db: AsyncSession,
    *,
    trigger_type: str = TRIGGER_SCHEDULED,
    triggered_by: str | None = None,
    event_id: str | None = None,
    pipeline_run_id: str | None = None,
) -> OaSyncRun:
    """创建一个同步批次。"""
    run = OaSyncRun(
        run_code=_gen_run_code(),
        trigger_type=trigger_type,
        triggered_by=triggered_by,
        event_id=event_id,
        pipeline_run_id=pipeline_run_id,
        status=PROCESS_PENDING,
        started_at=datetime.now(timezone.utc),
    )
    db.add(run)
    await db.flush()
    return run


async def save_run_results(
    db: AsyncSession,
    run: OaSyncRun,
    diffs: list[dict],
    *,
    approval_pending_orgs: list[str] | None = None,
) -> OaSyncRun:
    """将差异结果落库, 创建 oa_sync_record 行。"""
    approval_pending_orgs = approval_pending_orgs or []
    approval_set = set(approval_pending_orgs)

    counts = {DIFF_CREATED: 0, DIFF_UPDATED: 0, DIFF_MOVED: 0, DIFF_DELETED: 0, DIFF_UNCHANGED: 0}

    for d in diffs:
        if d["diff_type"] in counts:
            counts[d["diff_type"]] += 1

        # 高风险动作 (DELETED / MOVED) 需要审批, 标记为 APPROVAL_PENDING
        process_status = PROCESS_PENDING
        if d["diff_type"] in (DIFF_DELETED, DIFF_MOVED) and d["org_code"] in approval_set:
            process_status = PROCESS_APPROVAL_PENDING
        elif d["diff_type"] == DIFF_UNCHANGED:
            process_status = PROCESS_SYNCED  # 视为已同步

        record = OaSyncRecord(
            run_id=run.id,
            org_code=d["org_code"],
            org_name=d.get("org_name", d["org_code"]),
            parent_org_code=d.get("parent_org_code"),
            source_status=d["source"].get("status") if d.get("source") else None,
            source_path=d["source"].get("path") if d.get("source") else None,
            target_org_id=d["target"].get("org_id") if d.get("target") else None,
            target_status=d["target"].get("status") if d.get("target") else None,
            diff_type=d["diff_type"],
            diff_detail=d.get("diff_detail"),
            process_status=process_status,
            synced_at=datetime.now(timezone.utc) if process_status == PROCESS_SYNCED else None,
        )
        db.add(record)

    run.total_orgs = len(diffs)
    run.created_count = counts[DIFF_CREATED]
    run.updated_count = counts[DIFF_UPDATED]
    run.moved_count = counts[DIFF_MOVED]
    run.deleted_count = counts[DIFF_DELETED]
    run.unchanged_count = counts[DIFF_UNCHANGED]
    run.approval_pending_count = len(approval_pending_orgs)
    run.ended_at = datetime.now(timezone.utc)
    run.status = "SUCCESS"  # 即使有差异, 同步检测本身成功

    await db.flush()
    return run


async def mark_run_failed(
    db: AsyncSession,
    run: OaSyncRun,
    error_message: str,
) -> OaSyncRun:
    """标记同步批次失败。"""
    run.status = "FAILED"
    run.error_message = error_message[:1000]
    run.ended_at = datetime.now(timezone.utc)
    await db.flush()
    return run


# ===== 查询 =====


async def list_runs(
    db: AsyncSession,
    *,
    status: str | None = None,
    limit: int = 20,
    offset: int = 0,
) -> list[OaSyncRun]:
    stmt = select(OaSyncRun)
    if status:
        stmt = stmt.where(OaSyncRun.status == status)
    stmt = stmt.order_by(desc(OaSyncRun.created_at)).limit(limit).offset(offset)
    return list((await db.execute(stmt)).scalars().all())


async def get_run(db: AsyncSession, run_id: int) -> OaSyncRun | None:
    return (await db.execute(select(OaSyncRun).where(OaSyncRun.id == run_id))).scalar_one_or_none()


async def list_records(
    db: AsyncSession,
    *,
    run_id: int | None = None,
    diff_type: str | None = None,
    process_status: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> list[OaSyncRecord]:
    stmt = select(OaSyncRecord)
    if run_id is not None:
        stmt = stmt.where(OaSyncRecord.run_id == run_id)
    if diff_type:
        stmt = stmt.where(OaSyncRecord.diff_type == diff_type)
    if process_status:
        stmt = stmt.where(OaSyncRecord.process_status == process_status)
    stmt = stmt.order_by(OaSyncRecord.id).limit(limit).offset(offset)
    return list((await db.execute(stmt)).scalars().all())


# ===== 高风险动作审批集成 =====


async def submit_high_risk_approvals(
    db: AsyncSession,
    run: OaSyncRun,
    approvers: list[dict],
    triggered_by: str | None,
    approval_mode: str = "ANY",
) -> dict:
    """为高风险记录 (DELETED / MOVED) 提交审批请求。

    返回: {org_code: approval_id} 映射。
    """
    from app.ucp.approval_service import submit_request, ApprovalError

    records = await list_records(
        db, run_id=run.id, process_status=PROCESS_APPROVAL_PENDING,
        limit=1000,
    )
    approval_map = {}

    for rec in records:
        business_type = BUSINESS_OA_ORG_DELETE if rec.diff_type == DIFF_DELETED else BUSINESS_OA_ORG_MOVE
        action = "DELETE" if rec.diff_type == DIFF_DELETED else "MOVE"
        try:
            request = await submit_request(
                db,
                business_type=business_type,
                business_key=rec.org_code,
                business_summary=f"组织 {rec.org_name} 同步需 {action}",
                action=action,
                action_payload={
                    "run_id": run.id,
                    "org_code": rec.org_code,
                    "org_name": rec.org_name,
                    "parent_org_code": rec.parent_org_code,
                    "diff_detail": rec.diff_detail,
                },
                approvers=approvers,
                approval_mode=approval_mode,
                confirmation_type="TOKEN",
                trigger_source="EVENT" if run.trigger_type == TRIGGER_EVENT else "MANUAL",
                triggered_by=triggered_by,
                pipeline_run_id=run.pipeline_run_id,
                event_id=run.event_id,
                reason=f"OA 同步批次 {run.run_code} 检测到 {rec.diff_type} 动作",
            )
            rec.approval_id = request.id
            approval_map[rec.org_code] = request.id
        except ApprovalError as e:
            logger.warning("[ucp] oa sync submit approval failed for %s: %s", rec.org_code, e)
            rec.process_status = PROCESS_FAILED
            rec.process_error = f"提交审批失败: {e.message}"

    await db.flush()
    return approval_map


# ===== ORM 转字典 =====


def run_to_dict(run: OaSyncRun) -> dict:
    return {
        "id": run.id,
        "run_code": run.run_code,
        "trigger_type": run.trigger_type,
        "source_system": run.source_system,
        "target_system": run.target_system,
        "status": run.status,
        "total_orgs": run.total_orgs,
        "created_count": run.created_count,
        "updated_count": run.updated_count,
        "moved_count": run.moved_count,
        "deleted_count": run.deleted_count,
        "unchanged_count": run.unchanged_count,
        "approval_pending_count": run.approval_pending_count,
        "error_message": run.error_message,
        "triggered_by": run.triggered_by,
        "event_id": run.event_id,
        "pipeline_run_id": run.pipeline_run_id,
        "started_at": run.started_at.isoformat() if run.started_at else None,
        "ended_at": run.ended_at.isoformat() if run.ended_at else None,
        "created_at": run.created_at.isoformat() if run.created_at else None,
    }


def record_to_dict(rec: OaSyncRecord) -> dict:
    return {
        "id": rec.id,
        "run_id": rec.run_id,
        "org_code": rec.org_code,
        "org_name": rec.org_name,
        "parent_org_code": rec.parent_org_code,
        "source_status": rec.source_status,
        "source_path": rec.source_path,
        "target_org_id": rec.target_org_id,
        "target_status": rec.target_status,
        "diff_type": rec.diff_type,
        "diff_detail": rec.diff_detail,
        "process_status": rec.process_status,
        "process_error": rec.process_error,
        "approval_id": rec.approval_id,
        "synced_at": rec.synced_at.isoformat() if rec.synced_at else None,
        "created_at": rec.created_at.isoformat() if rec.created_at else None,
        "updated_at": rec.updated_at.isoformat() if rec.updated_at else None,
    }
