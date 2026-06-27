"""接收人解析服务

负责把 ReceiverRule 解析为飞书可发送的接收人对象（open_id 或 chat_id）。

解析策略（第一期）：
  fixed_users              → 查 users.feishu_user_id
  fixed_chats              → 直接使用 chat_id
  employee_field_user      → 查 emp_realtime_roster.raw[target_field] → PersonResolver
  employee_department_manager → 查 emp_realtime_roster → org_tree.manager → PersonResolver

PersonResolver 第一期解析顺序：
  原始值 → users.login_name 精确匹配
         → users.display_name 精确匹配
         → users.email 精确匹配
         → users.feishu_user_id 直接匹配
         → 解析失败
"""
from __future__ import annotations

import logging
from typing import Any

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.integrations.feishu.schemas import (
    EmployeeDepartmentManagerRule,
    EmployeeFieldUserRule,
    FixedChatsRule,
    FixedUsersRule,
    ReceiverRule,
    ResolveError,
    ResolvedReceiver,
    ResolveResult,
)

# 第一期只允许 emp_realtime_roster，防止 SQL 注入
ALLOWED_SOURCE_TABLES = frozenset({"emp_realtime_roster"})
from app.users.models import User


logger = logging.getLogger("feishu.receiver_resolver")


# ===== PersonResolver =====

async def resolve_person(raw_value: str, db: AsyncSession) -> tuple[str | None, str | None]:
    """把花名册字段值或人员名称解析为 (feishu_open_id, display_name)。

    返回 (None, None) 表示解析失败。
    返回 ("ambiguous", "...") 表示匹配到多个用户，存在歧义。
    """
    if not raw_value or not raw_value.strip():
        return None, None

    val = raw_value.strip()
    # 依次尝试：login_name, display_name, email, feishu_user_id 精确匹配
    for col in ("login_name", "display_name", "email", "feishu_user_id"):
        stmt = select(User).where(getattr(User, col) == val)
        results = (await db.execute(stmt)).scalars().all()
        if len(results) == 1:
            u = results[0]
            if not u.feishu_user_id:
                return None, f"用户 {u.display_name}（{u.login_name}）缺少 feishu_user_id"
            return u.feishu_user_id, u.display_name
        if len(results) > 1:
            names = "、".join(f"{u.display_name}({u.login_name})" for u in results)
            return "ambiguous", f"字段值 '{val}' 匹配到多个用户（{names}），无法唯一确定接收人"
    return None, f"字段值 '{val}' 未匹配到任何用户"


# ===== 各规则解析函数 =====

async def _resolve_fixed_users(
    rule: FixedUsersRule,
    db: AsyncSession,
) -> tuple[list[ResolvedReceiver], list[ResolveError]]:
    receivers: list[ResolvedReceiver] = []
    errors: list[ResolveError] = []
    for uid in rule.user_ids:
        u = await db.get(User, uid)
        if u is None:
            errors.append(ResolveError(rule_type="fixed_users", message=f"用户 ID {uid} 不存在"))
            continue
        if not u.feishu_user_id:
            errors.append(ResolveError(
                rule_type="fixed_users",
                message=f"用户 {u.display_name}（ID={uid}）缺少 feishu_user_id，无法发送"
            ))
            continue
        receivers.append(ResolvedReceiver(
            receiver_type="user",
            receiver_id=u.feishu_user_id,
            display_name=u.display_name or u.login_name,
            source="fixed_users",
        ))
    return receivers, errors


async def _resolve_fixed_chats(
    rule: FixedChatsRule,
) -> tuple[list[ResolvedReceiver], list[ResolveError]]:
    receivers = [
        ResolvedReceiver(
            receiver_type="chat",
            receiver_id=cid,
            display_name=f"群 {cid}",
            source="fixed_chats",
        )
        for cid in rule.chat_ids
    ]
    return receivers, []


async def _resolve_employee_field_user(
    rule: EmployeeFieldUserRule,
    context: dict[str, Any],
    db: AsyncSession,
) -> tuple[list[ResolvedReceiver], list[ResolveError]]:
    receivers: list[ResolvedReceiver] = []
    errors: list[ResolveError] = []

    employee_no = context.get("employee_no") or context.get(rule.employee_key_field)
    if not employee_no:
        errors.append(ResolveError(
            rule_type="employee_field_user",
            message=f"上下文缺少 employee_no，无法解析 {rule.target_field}"
        ))
        return receivers, errors

    # 校验 source_table 白名单，防止 SQL 注入
    if rule.source_table not in ALLOWED_SOURCE_TABLES:
        errors.append(ResolveError(
            rule_type="employee_field_user",
            message=f"不允许的来源表: {rule.source_table}，当前仅支持 {sorted(ALLOWED_SOURCE_TABLES)}"
        ))
        return receivers, errors

    # 查花名册
    stmt = text(
        f"SELECT raw FROM {rule.source_table} WHERE raw->>'employee_no' = :emp_no LIMIT 1"
    )
    result = (await db.execute(stmt, {"emp_no": str(employee_no)})).fetchone()
    if result is None:
        errors.append(ResolveError(
            rule_type="employee_field_user",
            message=f"员工 {employee_no} 在 {rule.source_table} 中不存在"
        ))
        return receivers, errors

    raw: dict = result[0] or {}
    target_value = raw.get(rule.target_field)
    if not target_value:
        errors.append(ResolveError(
            rule_type="employee_field_user",
            message=f"员工 {employee_no} 的 {rule.target_field} 字段为空"
        ))
        return receivers, errors

    open_id, display_name = await resolve_person(str(target_value), db)
    if open_id is None:
        errors.append(ResolveError(
            rule_type="employee_field_user",
            message=display_name or f"员工 {rule.target_field}={target_value} 无法解析为飞书用户"
        ))
    elif open_id == "ambiguous":
        errors.append(ResolveError(rule_type="employee_field_user", message=display_name or ""))
    else:
        receivers.append(ResolvedReceiver(
            receiver_type="user",
            receiver_id=open_id,
            display_name=display_name or target_value,
            source=f"employee_field_user:{rule.target_field}",
        ))
    return receivers, errors


async def _resolve_employee_department_manager(
    rule: EmployeeDepartmentManagerRule,
    context: dict[str, Any],
    db: AsyncSession,
) -> tuple[list[ResolvedReceiver], list[ResolveError]]:
    receivers: list[ResolvedReceiver] = []
    errors: list[ResolveError] = []

    employee_no = context.get("employee_no") or context.get(rule.employee_key_field)
    if not employee_no:
        errors.append(ResolveError(
            rule_type="employee_department_manager",
            message="上下文缺少 employee_no，无法解析部门负责人"
        ))
        return receivers, errors

    # 校验 source_table 白名单，防止 SQL 注入
    if rule.source_table not in ALLOWED_SOURCE_TABLES:
        errors.append(ResolveError(
            rule_type="employee_department_manager",
            message=f"不允许的来源表: {rule.source_table}，当前仅支持 {sorted(ALLOWED_SOURCE_TABLES)}"
        ))
        return receivers, errors

    # 查花名册，获取部门名
    roster_stmt = text(
        f"SELECT raw FROM {rule.source_table} WHERE raw->>'employee_no' = :emp_no LIMIT 1"
    )
    roster_result = (await db.execute(roster_stmt, {"emp_no": str(employee_no)})).fetchone()
    if roster_result is None:
        errors.append(ResolveError(
            rule_type="employee_department_manager",
            message=f"员工 {employee_no} 在花名册中不存在"
        ))
        return receivers, errors

    raw: dict = roster_result[0] or {}
    dept_name = raw.get(rule.department_field)
    if not dept_name:
        errors.append(ResolveError(
            rule_type="employee_department_manager",
            message=f"员工 {employee_no} 的 {rule.department_field} 字段为空"
        ))
        return receivers, errors

    # 在 org_tree 中查找部门负责人（名称匹配）
    tree_stmt = text(
        "SELECT manager FROM org_tree WHERE name = :dept_name LIMIT 1"
    )
    tree_result = (await db.execute(tree_stmt, {"dept_name": dept_name})).fetchone()
    if tree_result is None or not tree_result[0]:
        errors.append(ResolveError(
            rule_type="employee_department_manager",
            message=f"组织树中找不到部门 '{dept_name}' 或该部门无负责人"
        ))
        return receivers, errors

    manager_value = tree_result[0]
    open_id, display_name = await resolve_person(str(manager_value), db)
    if open_id is None:
        errors.append(ResolveError(
            rule_type="employee_department_manager",
            message=display_name or f"部门 '{dept_name}' 的负责人 {manager_value} 无法解析为飞书用户"
        ))
    elif open_id == "ambiguous":
        errors.append(ResolveError(rule_type="employee_department_manager", message=display_name or ""))
    else:
        receivers.append(ResolvedReceiver(
            receiver_type="user",
            receiver_id=open_id,
            display_name=display_name or manager_value,
            source=f"employee_department_manager:{rule.department_field}",
        ))
    return receivers, errors


# ===== 主解析入口 =====

async def resolve_receivers(
    rules: list[ReceiverRule],
    context: dict[str, Any],
    db: AsyncSession,
) -> ResolveResult:
    """解析所有接收人规则，返回去重后的接收人列表和错误列表。"""
    all_receivers: list[ResolvedReceiver] = []
    all_errors: list[ResolveError] = []

    for rule in rules:
        if rule.type == "fixed_users":
            r, e = await _resolve_fixed_users(rule, db)
        elif rule.type == "fixed_chats":
            r, e = await _resolve_fixed_chats(rule)
        elif rule.type == "employee_field_user":
            r, e = await _resolve_employee_field_user(rule, context, db)
        elif rule.type == "employee_department_manager":
            r, e = await _resolve_employee_department_manager(rule, context, db)
        else:
            e = [ResolveError(rule_type="unknown", message=f"未知规则类型: {rule.type}")]
            r = []
        all_receivers.extend(r)
        all_errors.extend(e)

    # 去重（按 receiver_type + receiver_id 去重，保留第一个）
    seen: set[tuple[str, str]] = set()
    deduped: list[ResolvedReceiver] = []
    for rcv in all_receivers:
        key = (rcv.receiver_type, rcv.receiver_id)
        if key not in seen:
            seen.add(key)
            deduped.append(rcv)

    return ResolveResult(
        ok=len(all_errors) == 0,
        receivers=deduped,
        errors=all_errors,
    )
