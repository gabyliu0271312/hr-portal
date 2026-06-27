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
    """鏍￠獙瑙勫垯閰嶇疆锛岃繑鍥為敊璇垪琛ㄣ€傜┖鍒楄〃琛ㄧず鍚堟硶銆?
    鑽夌妯″紡锛坋nabled=False锛夊彧鏍￠獙鍚嶇О锛岃烦杩囪Е鍙戝櫒鍜屽姩浣滄牎楠屻€?    """
    from app.automation.action_registry import ACTION_REGISTRY
    from app.automation.trigger_registry import get_trigger_meta

    errors: list[str] = []

    # 鑽夌妯″紡锛氬彧鏍￠獙鍚嶇О锛堝悕绉板凡鍦?Schema 灞傛牎楠?min_length=1锛?    if not data.enabled:
        return errors

    # 鍚敤鐘舵€侊細瀹屾暣鏍￠獙
    if not data.trigger_type:
        errors.append("trigger_type 涓嶈兘涓虹┖")
    elif not get_trigger_meta(data.trigger_type):
        errors.append(f"涓嶆敮鎸佺殑 trigger_type: {data.trigger_type}")
    if not data.actions_config:
        errors.append("鑷冲皯闇€瑕佷竴涓姩浣?)
    for i, action in enumerate(data.actions_config):
        if action.type not in ACTION_REGISTRY:
            errors.append(f"鍔ㄤ綔[{i}] type='{action.type}' 鏈敞鍐?)
        # 椋炰功鍙戦€佸姩浣滐細妫€鏌ユ帴鏀朵汉鑷冲皯鏈変竴鏉℃湁鏁堣鍒?        if action.type == "feishu_send_message":
            config = action.config or {}
            recvs = config.get("receivers", [])
            if not recvs:
                errors.append(f"鍔ㄤ綔[{i}] 椋炰功閫氱煡鏈厤缃帴鏀朵汉")
            else:
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
                        # 鍔ㄦ€佽鍒欏彧瑕?type 姝ｇ‘鍗宠涓烘湁鏁?                        has_valid = True
                        break
                if not has_valid:
                    errors.append(
                        f"鍔ㄤ綔[{i}] 鎺ユ敹浜虹己灏戞湁鏁?ID锛堣鎸囧畾鍏蜂綋鐢ㄦ埛/缇ゆ垨鍔ㄦ€佸瓧娈碉級"
                    )
    return errors
