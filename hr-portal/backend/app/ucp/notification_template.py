"""UCP 通知模板服务 (Phase 2-10)

提供：
  - 模板 CRUD（list/get/create/update/delete/toggle）
  - 模板预览（用 mock 变量渲染 title/content）
  - 模板应用：把模板套用到 pipeline/resource 的 notification_config

模板字段：
  - template_code / template_name / description
  - trigger_scene: on_success / on_failure / on_partial_success / on_circuit_open
  - channel: feishu / email
  - message_format: markdown / text
  - title_template / content_template（{{var}} 占位）
  - receivers: 与 notification_config.receivers 同构
  - variable_schema: {var_name: 描述}，前端预览面板展示
"""
from __future__ import annotations

import logging
import re
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ucp.models import UcpNotificationTemplate

logger = logging.getLogger("ucp.notification_template")

# ===== 触发场景常量 =====
SCENE_ON_SUCCESS = "on_success"
SCENE_ON_FAILURE = "on_failure"
SCENE_ON_PARTIAL_SUCCESS = "on_partial_success"
SCENE_ON_CIRCUIT_OPEN = "on_circuit_open"

ALL_SCENES = [
    SCENE_ON_SUCCESS,
    SCENE_ON_FAILURE,
    SCENE_ON_PARTIAL_SUCCESS,
    SCENE_ON_CIRCUIT_OPEN,
]

SCENE_LABELS = {
    SCENE_ON_SUCCESS: "执行成功",
    SCENE_ON_FAILURE: "执行失败",
    SCENE_ON_PARTIAL_SUCCESS: "部分成功",
    SCENE_ON_CIRCUIT_OPEN: "熔断触发",
}

# ===== 渠道 =====
CHANNEL_FEISHU = "feishu"
CHANNEL_EMAIL = "email"

ALL_CHANNELS = [CHANNEL_FEISHU, CHANNEL_EMAIL]

# ===== 内置变量清单（前端预览面板/变量说明用） =====
DEFAULT_VARIABLE_SCHEMA = {
    "execution_status": "执行状态（SUCCESS / FAILED / PARTIAL_SUCCESS）",
    "execution_pipeline_code": "流水线编码",
    "execution_trace_id": "追踪 ID",
    "execution_run_id": "本次执行运行 ID",
    "execution_duration": "执行耗时（人类可读）",
    "pending_count": "待入职人数（Offer 同步场景）",
    "offer_success_count": "Offer 拉取成功数",
    "offer_failed_count": "Offer 拉取失败数",
    "merged_count": "合并写入数",
    "partial_severity": "PARTIAL 严重度（NONE/WARNING/CRITICAL）",
    "partial_severity_label": "PARTIAL 严重度中文标签",
    "partial_total_failed": "PARTIAL 失败总数",
    "partial_total_not_found": "PARTIAL 未找到总数",
    "partial_total": "PARTIAL 总数",
}


# ===== 错误 =====

class NotificationTemplateError(Exception):
    def __init__(self, error_code: str, message: str):
        self.error_code = error_code
        self.message = message
        super().__init__(f"[{error_code}] {message}")


# ===== 列表与详情 =====

async def list_templates(
    db: AsyncSession,
    trigger_scene: str | None = None,
    is_active: int | None = None,
    keyword: str | None = None,
    limit: int = 100,
) -> list[dict]:
    stmt = select(UcpNotificationTemplate)
    if trigger_scene:
        stmt = stmt.where(UcpNotificationTemplate.trigger_scene == trigger_scene)
    if is_active is not None:
        stmt = stmt.where(UcpNotificationTemplate.is_active == is_active)
    if keyword:
        like = f"%{keyword}%"
        stmt = stmt.where(
            (UcpNotificationTemplate.template_code.ilike(like))
            | (UcpNotificationTemplate.template_name.ilike(like))
        )
    stmt = stmt.order_by(UcpNotificationTemplate.id.desc()).limit(limit)
    rows = (await db.execute(stmt)).scalars().all()
    return [_to_dict(t) for t in rows]


async def get_template(db: AsyncSession, template_id: int) -> dict | None:
    t = await db.get(UcpNotificationTemplate, template_id)
    return _to_dict(t) if t else None


async def get_template_by_code(db: AsyncSession, template_code: str) -> dict | None:
    stmt = select(UcpNotificationTemplate).where(
        UcpNotificationTemplate.template_code == template_code,
    )
    t = (await db.execute(stmt)).scalar_one_or_none()
    return _to_dict(t) if t else None


# ===== CRUD =====

async def create_template(
    db: AsyncSession,
    *,
    template_code: str,
    template_name: str,
    description: str | None = None,
    trigger_scene: str = SCENE_ON_SUCCESS,
    channel: str = CHANNEL_FEISHU,
    message_format: str = "markdown",
    title_template: str,
    content_template: str,
    receivers: list | None = None,
    variable_schema: dict | None = None,
    is_active: int = 1,
    created_by: str | None = None,
) -> dict:
    # 唯一性校验
    existing = await get_template_by_code(db, template_code)
    if existing:
        raise NotificationTemplateError(
            "TEMPLATE_CODE_EXISTS",
            f"模板编码 '{template_code}' 已存在",
        )

    if trigger_scene not in ALL_SCENES:
        raise NotificationTemplateError(
            "INVALID_TRIGGER_SCENE",
            f"触发场景必须是 {ALL_SCENES} 之一",
        )
    if channel not in ALL_CHANNELS:
        raise NotificationTemplateError(
            "INVALID_CHANNEL",
            f"渠道必须是 {ALL_CHANNELS} 之一",
        )
    if message_format not in ("markdown", "text"):
        raise NotificationTemplateError(
            "INVALID_FORMAT",
            "消息格式必须是 markdown / text",
        )
    if not title_template.strip() or not content_template.strip():
        raise NotificationTemplateError(
            "MISSING_TEMPLATE",
            "标题模板和正文模板不能为空",
        )

    # 提取变量清单（合并 default + user）
    schema = dict(DEFAULT_VARIABLE_SCHEMA)
    if variable_schema:
        schema.update(variable_schema)

    tpl = UcpNotificationTemplate(
        template_code=template_code,
        template_name=template_name,
        description=description,
        trigger_scene=trigger_scene,
        channel=channel,
        message_format=message_format,
        title_template=title_template,
        content_template=content_template,
        receivers=receivers or [],
        variable_schema=schema,
        is_active=is_active,
        created_by=created_by,
    )
    db.add(tpl)
    await db.flush()
    return _to_dict(tpl)


async def update_template(
    db: AsyncSession,
    template_id: int,
    *,
    template_name: str | None = None,
    description: str | None = None,
    trigger_scene: str | None = None,
    channel: str | None = None,
    message_format: str | None = None,
    title_template: str | None = None,
    content_template: str | None = None,
    receivers: list | None = None,
    variable_schema: dict | None = None,
    updated_by: str | None = None,
) -> dict:
    tpl = await db.get(UcpNotificationTemplate, template_id)
    if tpl is None:
        raise NotificationTemplateError("TEMPLATE_NOT_FOUND", f"模板 #{template_id} 不存在")

    if trigger_scene is not None and trigger_scene not in ALL_SCENES:
        raise NotificationTemplateError("INVALID_TRIGGER_SCENE", f"触发场景必须是 {ALL_SCENES} 之一")
    if channel is not None and channel not in ALL_CHANNELS:
        raise NotificationTemplateError("INVALID_CHANNEL", f"渠道必须是 {ALL_CHANNELS} 之一")
    if message_format is not None and message_format not in ("markdown", "text"):
        raise NotificationTemplateError("INVALID_FORMAT", "消息格式必须是 markdown / text")

    if template_name is not None:
        tpl.template_name = template_name
    if description is not None:
        tpl.description = description
    if trigger_scene is not None:
        tpl.trigger_scene = trigger_scene
    if channel is not None:
        tpl.channel = channel
    if message_format is not None:
        tpl.message_format = message_format
    if title_template is not None:
        tpl.title_template = title_template
    if content_template is not None:
        tpl.content_template = content_template
    if receivers is not None:
        tpl.receivers = receivers
    if variable_schema is not None:
        # 合并：保留 default，再覆盖 user
        schema = dict(DEFAULT_VARIABLE_SCHEMA)
        schema.update(variable_schema)
        tpl.variable_schema = schema
    if updated_by is not None:
        tpl.updated_by = updated_by

    await db.flush()
    return _to_dict(tpl)


async def toggle_template(db: AsyncSession, template_id: int) -> dict:
    tpl = await db.get(UcpNotificationTemplate, template_id)
    if tpl is None:
        raise NotificationTemplateError("TEMPLATE_NOT_FOUND", f"模板 #{template_id} 不存在")
    tpl.is_active = 0 if tpl.is_active else 1
    await db.flush()
    return _to_dict(tpl)


async def delete_template(db: AsyncSession, template_id: int) -> None:
    tpl = await db.get(UcpNotificationTemplate, template_id)
    if tpl is None:
        raise NotificationTemplateError("TEMPLATE_NOT_FOUND", f"模板 #{template_id} 不存在")
    await db.delete(tpl)
    await db.flush()


# ===== 预览与渲染 =====

def _replace_vars(template: str, vars_dict: dict) -> str:
    """{{var}} 占位符替换。"""
    def replacer(match: re.Match) -> str:
        var_name = match.group(1)
        value = vars_dict.get(var_name)
        if value is None:
            return match.group(0)  # 保留占位符提示未渲染
        return str(value)

    return re.sub(r"\{\{(\w+)\}\}", replacer, template)


def extract_variables(template: str) -> list[str]:
    """从模板中提取所有 {{var}} 变量名（去重保序）。"""
    return list(dict.fromkeys(re.findall(r"\{\{(\w+)\}\}", template or "")))


async def preview_template(
    db: AsyncSession,
    template_id: int,
    mock_vars: dict | None = None,
) -> dict:
    """用 mock 变量渲染模板，返回预览结果。

    Returns:
        {
            "template_id": ...,
            "template_code": ...,
            "title_rendered": ...,
            "content_rendered": ...,
            "variables_used": ["pending_count", "execution_status"],
            "missing_variables": ["xxx"],  # 模板引用但 mock 中未提供
            "extra_variables": ["yyy"],     # mock 提供但模板未使用
        }
    """
    tpl = await db.get(UcpNotificationTemplate, template_id)
    if tpl is None:
        raise NotificationTemplateError("TEMPLATE_NOT_FOUND", f"模板 #{template_id} 不存在")

    # 默认 mock 数据
    mock = {
        "execution_status": "SUCCESS",
        "execution_pipeline_code": "MOCK_PIPELINE",
        "execution_trace_id": "trace-mock-001",
        "execution_run_id": "run-mock-001",
        "execution_duration": "1.2s",
        "pending_count": 12,
        "offer_success_count": 10,
        "offer_failed_count": 2,
        "merged_count": 10,
        "partial_severity": "NONE",
        "partial_severity_label": "无",
        "partial_total_failed": 0,
        "partial_total_not_found": 0,
        "partial_total": 12,
    }
    if mock_vars:
        mock.update(mock_vars)

    used = extract_variables(tpl.title_template) + extract_variables(tpl.content_template)
    used_unique = list(dict.fromkeys(used))

    title = _replace_vars(tpl.title_template, mock)
    content = _replace_vars(tpl.content_template, mock)

    missing = [v for v in used_unique if v not in mock]
    extra = [v for v in mock if v not in used_unique and v not in DEFAULT_VARIABLE_SCHEMA]

    return {
        "template_id": tpl.id,
        "template_code": tpl.template_code,
        "title_rendered": title,
        "content_rendered": content,
        "variables_used": used_unique,
        "missing_variables": missing,
        "extra_variables": extra,
    }


def render_template_inline(
    title_template: str,
    content_template: str,
    vars_dict: dict,
) -> dict:
    """不查 DB 的内联渲染（用于测试 / 实时预览）。"""
    return {
        "title_rendered": _replace_vars(title_template, vars_dict),
        "content_rendered": _replace_vars(content_template, vars_dict),
        "variables_used": extract_variables(title_template) + extract_variables(content_template),
    }


# ===== 模板应用：把模板转成 notification_config =====
def apply_template_to_config(template_dict: dict, base_config: dict | None = None) -> dict:
    """把模板套用到 notification_config 中（on_success / on_failure / on_partial_success）。

    Args:
        template_dict: 模板 dict（来自 _to_dict）
        base_config: 现有 notification_config（可选）

    Returns:
        合并后的 notification_config（不动 base_config.on_xxx 已有 enabled 状态，仅替换 title/content/receivers）
    """
    base = dict(base_config or {})
    scene = template_dict.get("trigger_scene", SCENE_ON_SUCCESS)
    target = dict(base.get(scene, {}))
    target["enabled"] = target.get("enabled", True)
    target["title"] = template_dict.get("title_template", "")
    target["content"] = template_dict.get("content_template", "")
    target["receivers"] = template_dict.get("receivers", [])
    target["template"] = template_dict.get("template_code", "")
    target["message_type"] = template_dict.get("channel", "feishu")
    base[scene] = target
    return base


# ===== 内部：序列化 =====

def _to_dict(tpl: UcpNotificationTemplate) -> dict:
    return {
        "id": tpl.id,
        "template_code": tpl.template_code,
        "template_name": tpl.template_name,
        "description": tpl.description,
        "trigger_scene": tpl.trigger_scene,
        "trigger_scene_label": SCENE_LABELS.get(tpl.trigger_scene, tpl.trigger_scene),
        "channel": tpl.channel,
        "message_format": tpl.message_format,
        "title_template": tpl.title_template,
        "content_template": tpl.content_template,
        "receivers": tpl.receivers or [],
        "variable_schema": tpl.variable_schema or {},
        "is_active": tpl.is_active,
        "created_by": tpl.created_by,
        "updated_by": tpl.updated_by,
        "created_at": tpl.created_at.isoformat() if tpl.created_at else None,
        "updated_at": tpl.updated_at.isoformat() if tpl.updated_at else None,
    }
