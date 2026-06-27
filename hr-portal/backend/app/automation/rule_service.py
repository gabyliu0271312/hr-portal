"""鑷姩鍖栬鍒?CRUD 鏈嶅姟"""
from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.automation.models import AutomationExecution, AutomationRule
from app.automation.schemas import AutomationRuleCreate, AutomationRuleUpdate


async def create_rule(
    data: AutomationRuleCreate,
    db: AsyncSession,
    created_by: int | None = None,
) -> AutomationRule:
    rule = AutomationRule(
        name=data.name,
        description=data.description,
        biz_type=data.biz_type,
        trigger_type=data.trigger_type,
        trigger_config=data.trigger_config,
        condition_config=[c.model_dump() for c in data.condition_config],
        actions_config=[a.model_dump() for a in data.actions_config],
        enabled=data.enabled,
        source=data.source,
        source_artifact_id=data.source_artifact_id,
        created_by=created_by,
        updated_by=created_by,
    )
    db.add(rule)
    await db.flush()
    return rule


async def update_rule(
    rule: AutomationRule,
    data: AutomationRuleUpdate,
    db: AsyncSession,
    updated_by: int | None = None,
) -> AutomationRule:
    if data.name is not None:
        rule.name = data.name
    if data.description is not None:
        rule.description = data.description
    if data.trigger_type is not None:
        rule.trigger_type = data.trigger_type
    if data.trigger_config is not None:
        rule.trigger_config = data.trigger_config
    if data.condition_config is not None:
        rule.condition_config = [c.model_dump() for c in data.condition_config]
    if data.actions_config is not None:
        rule.actions_config = [a.model_dump() for a in data.actions_config]
    if data.enabled is not None:
        rule.enabled = data.enabled
    rule.updated_by = updated_by
    await db.flush()
    return rule



async def validate_rule(data: AutomationRuleCreate) -> list[str]:
    """Validate automation rule config and return error messages."""
    from app.automation.action_registry import ACTION_REGISTRY
    from app.automation.trigger_registry import get_trigger_meta

    errors: list[str] = []

    # Draft mode: only validate basic schema fields.
    if not data.enabled:
        return errors

    if not data.trigger_type:
        errors.append("trigger_type is required")
    elif not get_trigger_meta(data.trigger_type):
        errors.append(f"unsupported trigger_type: {data.trigger_type}")

    if not data.actions_config:
        errors.append("at least one action is required")

    for i, action in enumerate(data.actions_config):
        if action.type not in ACTION_REGISTRY:
            errors.append(f"action[{i}] type={action.type!r} is not registered")
            continue

        if action.type == "feishu_send_message":
            config = action.config or {}
            recvs = config.get("receivers", [])
            if not recvs:
                errors.append(f"action[{i}] feishu receivers are required")
                continue

            has_valid = False
            for r in recvs:
                rtype = r.get("type", "")
                if rtype == "fixed_chats" and r.get("chat_ids"):
                    has_valid = True
                    break
                if rtype == "fixed_users" and r.get("user_ids"):
                    has_valid = True
                    break
                if rtype in ("employee_field_user", "employee_department_manager"):
                    has_valid = True
                    break
            if not has_valid:
                errors.append(f"action[{i}] receivers require valid user/chat IDs or dynamic receiver type")

    return errors
