"""Phase 7-D: 数据质量规则服务。

基于真实资源快照执行，不生成示例数据，不返回 is_demo。
"""

from __future__ import annotations

import re
from datetime import datetime, timezone

from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.ucp.models import UcpQualityRule, UcpQualityIssue


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

async def list_quality_rules(
    db: AsyncSession,
    rule_type: str | None = None,
    object_type: str | None = None,
    limit: int = 100,
) -> list[dict]:
    stmt = select(UcpQualityRule)
    if rule_type:
        stmt = stmt.where(UcpQualityRule.rule_type == rule_type)
    if object_type:
        stmt = stmt.where(UcpQualityRule.object_type == object_type)
    stmt = stmt.order_by(UcpQualityRule.updated_at.desc()).limit(limit)
    rows = (await db.execute(stmt)).scalars().all()
    return [_serialize_rule(r) for r in rows]


async def create_quality_rule(
    db: AsyncSession,
    rule_code: str, rule_name: str,
    object_type: str, rule_type: str,
    system_code: str | None = None,
    field_name: str | None = None,
    resource_id: int | None = None,
    rule_config: dict | None = None,
    severity: str = "WARN",
    cron_expression: str | None = None,
    description: str | None = None,
    created_by: str | None = None,
) -> dict:
    existing = (await db.execute(
        select(UcpQualityRule).where(UcpQualityRule.rule_code == rule_code)
    )).scalar_one_or_none()
    if existing:
        raise ValueError(f"质量规则 '{rule_code}' 已存在")

    rule = UcpQualityRule(
        rule_code=rule_code, rule_name=rule_name,
        object_type=object_type, rule_type=rule_type,
        system_code=system_code, field_name=field_name,
        resource_id=resource_id,
        rule_config=rule_config, severity=severity,
        cron_expression=cron_expression,
        description=description, created_by=created_by,
    )
    db.add(rule)
    await db.flush()
    return _serialize_rule(rule)


async def update_quality_rule(db: AsyncSession, rule_id: int, **fields) -> dict:
    rule = await db.get(UcpQualityRule, rule_id)
    if not rule:
        raise ValueError(f"质量规则 #{rule_id} 不存在")
    allowed = {"rule_name", "resource_id", "system_code", "field_name", "rule_config",
               "severity", "cron_expression", "is_active", "description"}
    for k, v in fields.items():
        if k in allowed and hasattr(rule, k):
            setattr(rule, k, v)
    await db.flush()
    return _serialize_rule(rule)


async def delete_quality_rule(db: AsyncSession, rule_id: int) -> bool:
    rule = await db.get(UcpQualityRule, rule_id)
    if not rule:
        raise ValueError(f"质量规则 #{rule_id} 不存在")
    await db.delete(rule)
    return True


async def scan_quality(
    db: AsyncSession,
    rule_id: int,
) -> dict:
    """执行质量扫描（Phase 7-D）。

    从 rule.resource_id 绑定的资源最近一次流水线执行快照中
    读取真实数据进行校验。不再使用示例数据。
    """
    rule = await db.get(UcpQualityRule, rule_id)
    if not rule:
        raise ValueError(f"质量规则 #{rule_id} 不存在")

    if not rule.resource_id:
        raise ValueError(
            "质量规则未绑定数据源。请先配置 resource_id 指向一个已执行过流水线的资源。"
        )

    ts = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
    scan_code = f"QSCAN-{rule.rule_code}-{ts}"

    # 从流水线执行快照读取真实数据
    data = await _read_resource_snapshot(db, rule.resource_id)
    if not data:
        raise ValueError(
            f"资源 #{rule.resource_id} 无可用数据。请先通过流水线执行该资源以生成快照。"
        )
    issues = []

    for idx, record in enumerate(data):
        obj_key = record.get("id") or record.get("code") or str(idx)
        field_val = record.get(rule.field_name) if rule.field_name else None

        issue = None
        if rule.rule_type == "REQUIRED":
            if field_val is None or (isinstance(field_val, str) and not field_val.strip()):
                issue = _make_issue(rule, scan_code, obj_key, "REQUIRED",
                                    str(field_val), "非空值")

        elif rule.rule_type == "UNIQUE":
            # 检查当前值是否在 data 中重复出现
            if field_val is not None:
                count = sum(1 for r in data if r.get(rule.field_name) == field_val)
                if count > 1:
                    issue = _make_issue(rule, scan_code, obj_key, "UNIQUE",
                                        str(field_val), "唯一值")

        elif rule.rule_type == "FORMAT" and rule.rule_config and field_val:
            pattern = rule.rule_config.get("pattern")
            if pattern and isinstance(field_val, str):
                if not re.match(pattern, str(field_val)):
                    issue = _make_issue(rule, scan_code, obj_key, "FORMAT",
                                        str(field_val), f"匹配格式: {pattern}")

        elif rule.rule_type == "ENUM" and rule.rule_config:
            allowed = rule.rule_config.get("values") or []
            if field_val is not None and field_val not in allowed:
                issue = _make_issue(rule, scan_code, obj_key, "ENUM",
                                    str(field_val), f"允许值: {allowed}")

        if issue:
            issues.append(issue)

    # 批量写入
    for iss in issues:
        db.add(iss)
    await db.flush()

    return {"scan_run_code": scan_code, "rule_code": rule.rule_code,
            "total_records": len(data), "issues_found": len(issues), "issues": issues,
            "resource_id": rule.resource_id}


async def list_quality_issues(
    db: AsyncSession,
    rule_id: int | None = None,
    scan_run_code: str | None = None,
    status: str | None = None,
    limit: int = 100,
) -> list[dict]:
    stmt = select(UcpQualityIssue)
    if rule_id:
        stmt = stmt.where(UcpQualityIssue.rule_id == rule_id)
    if scan_run_code:
        stmt = stmt.where(UcpQualityIssue.scan_run_code == scan_run_code)
    if status:
        stmt = stmt.where(UcpQualityIssue.status == status)
    stmt = stmt.order_by(desc(UcpQualityIssue.created_at)).limit(limit)
    rows = (await db.execute(stmt)).scalars().all()
    return [_serialize_issue(r) for r in rows]


def _make_issue(rule: UcpQualityRule, scan_code: str, obj_key: str,
                issue_type: str, current: str, expected: str) -> UcpQualityIssue:
    return UcpQualityIssue(
        rule_id=rule.id, scan_run_code=scan_code,
        object_type=rule.object_type, object_key=obj_key,
        system_code=rule.system_code, field_name=rule.field_name,
        issue_type=issue_type,
        current_value=current, expected_value=expected,
        severity=rule.severity,
    )


def _serialize_rule(r: UcpQualityRule) -> dict:
    return {
        "id": r.id, "rule_code": r.rule_code, "rule_name": r.rule_name,
        "resource_id": r.resource_id,
        "object_type": r.object_type, "system_code": r.system_code,
        "field_name": r.field_name, "rule_type": r.rule_type,
        "rule_config": r.rule_config, "severity": r.severity,
        "cron_expression": r.cron_expression,
        "is_active": bool(r.is_active),
        "description": r.description, "created_by": r.created_by,
        "created_at": r.created_at.isoformat() if r.created_at else None,
    }


def _serialize_issue(i: UcpQualityIssue) -> dict:
    return {
        "id": i.id, "rule_id": i.rule_id, "scan_run_code": i.scan_run_code,
        "object_type": i.object_type, "object_key": i.object_key,
        "system_code": i.system_code, "field_name": i.field_name,
        "issue_type": i.issue_type,
        "current_value": i.current_value, "expected_value": i.expected_value,
        "status": i.status, "severity": i.severity,
        "resolved_at": i.resolved_at.isoformat() if i.resolved_at else None,
        "created_at": i.created_at.isoformat() if i.created_at else None,
    }
