"""Persistence and canonical validation for performance template workflows."""
from __future__ import annotations

from copy import deepcopy
import re
from uuid import uuid4

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.performance.authorization_service import AuditEventInput, PerformanceAuditService
from app.performance.models import (
    PerformanceCycle, PerformanceProject, PerformanceProjectNodeSnapshot,
    PerformanceReviewQuestion, PerformanceTemplate, PerformanceTemplateWorkflow,
)
from app.performance.self_summary_service import review_question_ids
from app.performance.assessment_roles import ROLE_DOTTED_MANAGER, normalize_executor_identity
from app.performance.executor_config import normalize_result_reconsideration_executor


ALLOWED_NODE_TYPES = {
    "evaluation",
    "result_view",
    "result_reconsideration",
    "work_summary",
    "reviewer_360_invite",
    "reviewer_360_confirm",
    "calibration",
    "result_communication",
}
INVITE_SCOPE_ALL = "ALL"
INVITE_SCOPE_PARTIAL = "PARTIAL"
REVIEWER_360_LABEL = "360°评估人"
SHARED_MANAGER_EXECUTOR_NODE_TYPES = {"result_communication", "reviewer_360_confirm"}
REVIEWER_360_CONFIRM_MANAGER_TYPES = {"DIRECT_MANAGER", "LEVEL_1_MANAGER", "LEVEL_2_MANAGER"}
REFERENCE_SOURCE_NODE_TYPES = {"work_summary", "evaluation", "calibration", "result_communication", "result_reconsideration"}
CALIBRATION_EXECUTOR_TYPE = "PROJECT_CONFIGURED"
CALIBRATION_EXECUTOR_LABEL = "在项目配置时指定"
DEFAULT_APPEAL_PROMPT = "如果你不认可本次绩效结果，请详细说明复议原因并提供事实依据"
DEFAULT_APPEAL_REASON_INSTRUCTION = "请输入复议理由"


class TemplateWorkflowValidationError(ValueError):
    def __init__(self, message: str, *, node_id: str | None = None):
        super().__init__(message)
        self.node_id = node_id


class TemplateWorkflowLockedError(ValueError):
    pass


_DISPLAY_KEYS = {"hideName", "hideDescription", "allowView"}


def _display_only_content(content: dict) -> bool:
    return (content.get("content_slot") or "fill") == "reference" or content.get("type") in {"reference", "prompt"}


def _stable_item_order(items: list[dict]) -> list[dict]:
    ids = [str(item.get("id") or "") for item in items]
    return sorted(items, key=lambda item: str(item["id"])) if all(ids) and len(set(ids)) == len(ids) else items


def _locked_contents(contents: list[dict]) -> list[dict]:
    return sorted(
        [_locked_content(content) for content in contents if not _display_only_content(content)],
        key=lambda content: (content["content_slot"], content["content_id"]),
    )


def _without_display(settings: dict | None, defaults: dict | None = None, *, reference=False) -> dict:
    result = {**(defaults or {}), **deepcopy(settings or {})}
    for key in _DISPLAY_KEYS | ({"onlyWhenFilling"} if reference else set()):
        result.pop(key, None)
    return result


def _locked_content(content: dict) -> dict:
    result = deepcopy(content)
    result["content_id"] = _content_id(content)
    result.setdefault("content_slot", "fill")
    if result.get("id") == result["content_id"]:
        result.pop("id")
    result.pop("name", None)
    result.pop("description", None)
    result["settings"] = _without_display(result.get("settings"), {"allowMultiple": False})
    items = []
    for index, item in enumerate(result.get("items") or []):
        if item.get("kind") == "prompt":
            continue
        if not item.get("id"):
            item["_snapshot_field_index"] = index
        item.pop("label", None)
        item.pop("hint", None)
        item["settings"] = _without_display(item.get("settings"), {"mode": "fill", "required": True})
        items.append(item)
    result["items"] = _stable_item_order(items)
    reference = result.get("reference_settings")
    if isinstance(reference, dict):
        reference.pop("page_name", None)
        overrides = reference.get("content_settings") or {}
        for content_id, override in list(overrides.items()):
            root = _without_display(override.get("root"), reference=True)
            items = {key: remaining for key, value in (override.get("items") or {}).items() if (remaining := _without_display(value, reference=True))}
            remaining = {key: value for key, value in override.items() if key not in {"root", "items"}}
            if root:
                remaining["root"] = root
            if items:
                remaining["items"] = items
            if remaining:
                overrides[content_id] = remaining
            else:
                overrides.pop(content_id)
        if not overrides:
            reference.pop("content_settings", None)
        if not reference:
            result.pop("reference_settings", None)
    return result


def _locked_nodes(nodes: list[dict], library: list[dict]) -> list[dict]:
    result = []
    for raw in normalize_workflow_nodes(nodes):
        node = _materialize_node_contents(raw, library)
        bindings = node.get("content_bindings") or {}
        if not bindings:
            for content in node.get("content") or []:
                bindings.setdefault(content.get("content_slot") or "fill", []).append(_content_id(content))
        display_ids = {
            _content_id(content) for content in [*library, *(node.get("content") or [])]
            if _display_only_content(content)
        }
        node["content_bindings"] = {
            slot: sorted(str(value) for value in values if str(value) not in display_ids)
            for slot, values in bindings.items()
            if slot != "reference" and any(str(value) not in display_ids for value in values)
        }
        node["content"] = _locked_contents(node.get("content") or [])
        # 展示配置不参与 used 写入结构比对。
        for key in ("name", "description", "content_region_order"):
            node.pop(key, None)
        node.pop("content_page_name", None)
        node.pop("show_result_and_modify", None)
        for key in ("appeal_prompt_content", "appeal_reason_instruction"):
            node.pop(key, None)
        calibration = node.get("calibration_settings") or {}
        for content_id, override in list(calibration.items()):
            root = _without_display(override.get("settings"))
            items = {}
            for item_id, settings in (override.get("items") or {}).items():
                remaining = _without_display(settings, {"allowModify": True})
                if remaining != {"allowModify": True}:
                    items[item_id] = remaining
            remaining = {key: value for key, value in override.items() if key not in {"settings", "items"}}
            if root:
                remaining["settings"] = root
            if items:
                remaining["items"] = items
            if remaining:
                calibration[content_id] = remaining
            else:
                calibration.pop(content_id)
        node["calibration_settings"] = calibration
        result.append(node)
    return result


_MISSING_DISPLAY = object()


def _sync_display(target: dict, source: dict, keys: set[str], previous: dict) -> None:
    for key in keys:
        default = {"hideName": False, "hideDescription": False, "allowView": True, "onlyWhenFilling": False, "showIcon": True}.get(key, _MISSING_DISPLAY)
        if source.get(key, default) == previous.get(key, default):
            continue
        if key in source:
            target[key] = deepcopy(source[key])
        else:
            target.pop(key, None)


def _sync_settings_display(target: dict, source: dict, previous: dict) -> None:
    settings = deepcopy(target.get("settings") or {})
    _sync_display(settings, source.get("settings") or {}, _DISPLAY_KEYS, previous.get("settings") or {})
    if settings != (target.get("settings") or {}):
        target["settings"] = settings


def _sync_content_display(target: dict, source: dict, previous: dict) -> None:
    _sync_display(target, source, {"name", "description"}, previous)
    _sync_settings_display(target, source, previous)
    target_items = target.get("items") or []
    source_items = source.get("items") or []
    previous_items = previous.get("items") or []
    identity = lambda item, index: str(item.get("id") or f"@{index}")
    old_by_id = {identity(item, index): item for index, item in enumerate(previous_items)}
    incoming_by_id = {identity(item, index): item for index, item in enumerate(source_items)}
    for index, item in enumerate(target_items):
        if item.get("kind") == "prompt":
            continue
        item_id = identity(item, index)
        other, old = incoming_by_id.get(item_id), old_by_id.get(item_id)
        if other is not None and old is not None:
            _sync_display(item, other, {"label", "hint"}, old)
            _sync_settings_display(item, other, old)
    layout = lambda values: [item if item.get("kind") == "prompt" else identity(item, index) for index, item in enumerate(values)]
    if layout(source_items) != layout(previous_items):
        business = {}
        for index, item in enumerate(target_items):
            if item.get("kind") != "prompt":
                business.setdefault(identity(item, index), []).append(item)
        ordered = []
        for index, item in enumerate(source_items):
            if item.get("kind") == "prompt":
                ordered.append(deepcopy(item))
            elif business.get(identity(item, index)):
                ordered.append(business[identity(item, index)].pop(0))
        ordered.extend(item for items in business.values() for item in items)
        target["items"] = ordered


def _sync_template_contents(target: dict, source: dict, previous: dict) -> None:
    key = lambda content: (_content_id(content), content.get("content_slot") or "fill")
    incoming = {key(content): content for content in source.get("content") or []}
    old = {key(content): content for content in previous.get("content") or []}
    contents = target.get("content") or []
    for content in contents:
        identity = key(content)
        if not _display_only_content(content) and identity in incoming and identity in old:
            _sync_content_display(content, incoming[identity], old[identity])
    layout = lambda values: [content if _display_only_content(content) else key(content) for content in values]
    if layout(source.get("content") or []) != layout(previous.get("content") or []):
        business = {key(content): content for content in contents if not _display_only_content(content)}
        ordered = []
        for content in source.get("content") or []:
            if _display_only_content(content):
                ordered.append(deepcopy(content))
            elif key(content) in business:
                ordered.append(business.pop(key(content)))
        ordered.extend(business.values())
        target["content"] = ordered
        bindings = deepcopy(target.get("content_bindings") or {})
        display_ids = {_content_id(content) for content in [*contents, *(source.get("content") or []), *(previous.get("content") or [])] if _display_only_content(content)}
        for slot, ids in list(bindings.items()):
            bindings[slot] = [value for value in ids if str(value) not in display_ids] if slot != "reference" else []
        for content in ordered:
            if _display_only_content(content):
                slot = content.get("content_slot") or "fill"
                bindings.setdefault(slot, []).append(_content_id(content))
        if bindings or "content_bindings" in target:
            target["content_bindings"] = bindings


def default_workflow_nodes() -> list[dict]:
    return [
        {
            "node_id": "evaluation-1",
            "node_type": "evaluation",
            "name": "评估型环节",
            "description": "",
            "order": 1,
            "executor_types": ["DIRECT_MANAGER"],
            "executor_label": "实线上级",
            "evaluation_type": "SINGLE",
            "include_final_result": False,
            "system": False,
            "allow_invite_other_executors": False,
            "invite_executor_scope": INVITE_SCOPE_ALL,
            "invite_executor_types": [],
            "require_previous_node_completion": False,
            "subject_confirm_required": False,
            "calibration_reason_enabled": False,
            "calibration_reason_required": False,
        },
        {
            "node_id": "result-view-1",
            "node_type": "result_view",
            "name": "绩效结果查看环节",
            "description": "",
            "order": 2,
            "executor_types": ["SUBJECT"],
            "executor_label": "被评估人",
            "evaluation_type": None,
            "include_final_result": False,
            "system": True,
            "allow_invite_other_executors": False,
            "invite_executor_scope": INVITE_SCOPE_ALL,
            "invite_executor_types": [],
            "require_previous_node_completion": False,
            "subject_confirm_required": False,
            "calibration_reason_enabled": False,
            "calibration_reason_required": False,
        },
    ]


def _dedupe_strings(values: list[str]) -> list[str]:
    return list(dict.fromkeys(value.strip() for value in values if value and value.strip()))


def _content_id(content: dict) -> str:
    return str(content.get("content_id") or content.get("id") or f"{content.get('type', 'custom')}-{content.get('name', '')}")


def _normalize_prompt(value: object, node_id: str | None = None) -> dict:
    if not isinstance(value, dict):
        raise TemplateWorkflowValidationError("提示配置不合法", node_id=node_id)
    prompt = deepcopy(value)
    text = prompt.get("content")
    if not isinstance(text, str) or not text.strip() or len(text.strip()) > 2000:
        raise TemplateWorkflowValidationError("提示内容不能为空且最多 2000 个字符", node_id=node_id)
    title = prompt.get("title", "")
    if not isinstance(title, str):
        raise TemplateWorkflowValidationError("提示标题不合法", node_id=node_id)
    if prompt.get("scope") not in ("all", "cycle"):
        raise TemplateWorkflowValidationError("提示适用范围不合法", node_id=node_id)
    color = prompt.get("color")
    if not isinstance(color, str) or not re.fullmatch(r"#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})", color):
        raise TemplateWorkflowValidationError("提示颜色不合法", node_id=node_id)
    prompt.update(title=title, content=text.strip())
    return prompt


def _normalize_content(raw: dict, node_id: str | None = None) -> dict:
    content = deepcopy(raw)
    if content.get("type") == "prompt":
        content["prompt"] = _normalize_prompt(content.get("prompt"), node_id)
        content.update(items=[], name=content["prompt"]["title"] or "提示", description="")
    else:
        for item in content.get("items") or []:
            if item.get("kind") == "prompt":
                item["prompt"] = _normalize_prompt(item.get("prompt"), node_id)
    return content


def normalize_content_library(contents: list[dict]) -> list[dict]:
    normalized: list[dict] = []
    seen_ids: set[str] = set()
    for index, raw in enumerate(contents):
        if raw.get("type") == "reference" and raw.get("reference_kind") == "node":
            continue
        content = _normalize_content(raw)
        base_id = _content_id(content)
        content_id = base_id
        suffix = index + 1
        while content_id in seen_ids:
            content_id = f"{base_id}-{suffix}"
            suffix += 1
        seen_ids.add(content_id)
        content["content_id"] = content_id
        content.pop("content_slot", None)
        normalized.append(content)
    return normalized


def _merge_content_library(library: list[dict], contents: list[dict]) -> list[dict]:
    """内容库是唯一权威（对齐飞书共享 templateItem）：同一 content_id 的定义以 override 为准。"""
    merged = {content["content_id"]: content for content in normalize_content_library(library)}
    for raw in contents:
        if raw.get("type") == "reference" and raw.get("reference_kind") == "node":
            continue
        content = _normalize_content(raw)
        content["content_id"] = _content_id(content)
        content.pop("content_slot", None)
        merged[content["content_id"]] = content
    return list(merged.values())


def _fill_missing_contents(library: list[dict], contents: list[dict]) -> list[dict]:
    """补缺口：已存在的 content_id 不被覆盖，仅用于兼容历史节点内联内容。"""
    merged = {content["content_id"]: content for content in normalize_content_library(library)}
    for raw in contents:
        if raw.get("type") == "reference" and raw.get("reference_kind") == "node":
            continue
        content = _normalize_content(raw)
        content["content_id"] = _content_id(content)
        content.pop("content_slot", None)
        merged.setdefault(content["content_id"], content)
    return list(merged.values())


_CONTENT_LOCAL_KEYS = ("settings", "content_slot", "id")
_PROMPT_LOCAL_KEYS = ("allowView", "onlyWhenFilling")


def _content_definition(content: dict) -> dict:
    """内容定义：库内只保留共享定义，环节级设置与槽位由各节点单独保存。"""
    definition = deepcopy(content)
    for key in _CONTENT_LOCAL_KEYS:
        definition.pop(key, None)
    definition["content_id"] = _content_id(content)
    definition["items"] = [_item_definition(item) for item in content.get("items") or []]
    return definition


def _item_definition(item: dict) -> dict:
    definition = deepcopy(item)
    definition.pop("settings", None)
    return definition


def _merge_prompt(library_prompt: object, local_prompt: object) -> object:
    """提示的查看设置（allowView/onlyWhenFilling）属于环节级设置，投影时保留节点自己的值。"""
    if not isinstance(library_prompt, dict):
        return deepcopy(local_prompt) if isinstance(local_prompt, dict) else library_prompt
    merged = deepcopy(library_prompt)
    if isinstance(local_prompt, dict):
        for key in _PROMPT_LOCAL_KEYS:
            if isinstance(local_prompt.get(key), bool):
                merged[key] = local_prompt[key]
    return merged


def _project_content(node_content: dict, library_content: dict) -> dict:
    """把内容库的定义投影到节点内容上，保留该节点自己的环节级设置。"""
    definition = _content_definition(library_content)
    local_items = {
        str(item.get("id")): item for item in node_content.get("items") or []
    }
    items: list[dict] = []
    for item in definition["items"]:
        local = local_items.get(str(item.get("id")))
        if local is not None and "settings" in local:
            item["settings"] = deepcopy(local["settings"])
        if "prompt" in item:
            item["prompt"] = _merge_prompt(item["prompt"], local.get("prompt") if local else None)
        items.append(item)
    library_item_ids = {str(item.get("id")) for item in items}
    items.extend(
        deepcopy([item for item in node_content.get("items") or [] if str(item.get("id")) not in library_item_ids and item.get("kind") != "prompt"])
    )
    projected = {**definition, "items": items}
    if "prompt" in projected:
        projected["prompt"] = _merge_prompt(projected["prompt"], node_content.get("prompt"))
    for key in _CONTENT_LOCAL_KEYS:
        if key in node_content:
            projected[key] = deepcopy(node_content[key])
    return projected


def _normalize_content_page_name(node: dict, node_id: str) -> str | None:
    if "content_page_name" not in node or node.get("content_page_name") is None:
        return None
    content_page_name = str(node["content_page_name"]).strip()
    if not content_page_name or len(content_page_name) > 100:
        raise TemplateWorkflowValidationError(
            "页面名称长度必须为 1-100",
            node_id=node_id,
        )
    return content_page_name


def normalize_workflow_nodes(nodes: list[dict]) -> list[dict]:
    if not nodes:
        raise TemplateWorkflowValidationError("流程至少需要一个评估型环节")
    normalized: list[dict] = []
    seen_ids: set[str] = set()
    for index, raw in enumerate(nodes):
        node = deepcopy(raw)
        node_type = node.get("node_type")
        if node_type not in ALLOWED_NODE_TYPES:
            raise TemplateWorkflowValidationError(f"不支持的流程节点类型：{node_type}")
        node_id = str(node.get("node_id") or f"node-{uuid4().hex}")
        if node_id in seen_ids:
            raise TemplateWorkflowValidationError("流程节点标识重复", node_id=node_id)
        seen_ids.add(node_id)
        name = str(node.get("name") or "").strip()
        if not name or len(name) > 100:
            raise TemplateWorkflowValidationError("环节名称长度必须为 1-100", node_id=node_id)
        content_page_name = _normalize_content_page_name(node, node_id)
        description = str(node.get("description") or "")
        if len(description) > 2000:
            raise TemplateWorkflowValidationError("环节描述最多 2000 个字符", node_id=node_id)
        evaluation_type = node.get("evaluation_type")
        if evaluation_type not in (None, "SINGLE", "MULTI"):
            raise TemplateWorkflowValidationError("评估类型不合法", node_id=node_id)
        invite_scope = node.get("invite_executor_scope") or INVITE_SCOPE_ALL
        if invite_scope not in (INVITE_SCOPE_ALL, INVITE_SCOPE_PARTIAL):
            raise TemplateWorkflowValidationError("邀请执行人范围不合法", node_id=node_id)
        is_fixed_subject = node_type in {"result_view", "work_summary", "reviewer_360_invite"}
        is_360_invitation = node_type == "reviewer_360_invite"
        calibration_reason_enabled = (
            bool(node.get("calibration_reason_enabled", True))
            if node_type == "calibration"
            else False
        )
        appeal_prompt_content = str(node.get("appeal_prompt_content") or DEFAULT_APPEAL_PROMPT)
        appeal_reason_instruction = str(node.get("appeal_reason_instruction") or DEFAULT_APPEAL_REASON_INSTRUCTION)
        if node_type == "result_reconsideration" and len(appeal_prompt_content) > 1500:
            raise TemplateWorkflowValidationError("发起复议提示最多 1500 个字符", node_id=node_id)
        if node_type == "result_reconsideration" and len(appeal_reason_instruction) > 1000:
            raise TemplateWorkflowValidationError("复议填写说明最多 1000 个字符", node_id=node_id)
        executor_types = _dedupe_strings(list(node.get("executor_types") or []))
        executor_label = str(node.get("executor_label") or "")
        if node_type == "calibration":
            executor_types = [CALIBRATION_EXECUTOR_TYPE]
            executor_label = CALIBRATION_EXECUTOR_LABEL
        elif node_type in SHARED_MANAGER_EXECUTOR_NODE_TYPES:
            if node_type == "reviewer_360_confirm":
                executor_types = [
                    value for value in executor_types
                    if value in REVIEWER_360_CONFIRM_MANAGER_TYPES
                ]
            if node.get("executor_role_code") == ROLE_DOTTED_MANAGER or executor_label == "虚线上级":
                executor_label = "虚线上级"
            else:
                executor_label = "实线上级"
                if not executor_types:
                    executor_types = ["DIRECT_MANAGER"]
        normalized.append(
            {
                "node_id": node_id,
                "node_type": node_type,
                "name": name,
                "content_page_name": content_page_name,
                "description": description,
                "order": index + 1,
                "executor_types": ["SUBJECT"] if is_fixed_subject else executor_types,
                "executor_label": "被评估人" if is_fixed_subject else executor_label,
                "evaluation_type": evaluation_type,
                "include_final_result": bool(node.get("include_final_result", False)),
                "system": bool(node.get("system", False)),
                "allow_invite_other_executors": bool(node.get("allow_invite_other_executors", False)),
                "invite_executor_scope": invite_scope,
                "invite_executor_types": _dedupe_strings(list(node.get("invite_executor_types") or [])),
                "require_previous_node_completion": bool(node.get("require_previous_node_completion", False)) if is_360_invitation and index > 0 else False,
                "subject_confirm_required": bool(node.get("subject_confirm_required", False)) if node_type == "result_view" else False,
                "calibration_reason_enabled": calibration_reason_enabled,
                "calibration_reason_required": calibration_reason_enabled and bool(node.get("calibration_reason_required", False)),
                "appeal_prompt_content": (
                    appeal_prompt_content
                    if node_type == "result_reconsideration"
                    else ""
                ),
                "appeal_reason_instruction": (
                    appeal_reason_instruction
                    if node_type == "result_reconsideration"
                    else ""
                ),
                "show_result_and_modify": (
                    bool(node.get("show_result_and_modify", True))
                    if node_type == "result_reconsideration"
                    else False
                ),
                "executor_config": None,
                "content_bindings": deepcopy(node.get("content_bindings") or {}),
            }
        )
        if node.get("content_region_order") is not None:
            normalized[-1]["content_region_order"] = deepcopy(node["content_region_order"])
        if node_type == "calibration" and "calibration_settings" in node:
            normalized[-1]["calibration_settings"] = deepcopy(node["calibration_settings"])
        if node.get("content") is not None:
            normalized[-1]["content"] = [_normalize_content(content, node_id) for content in node["content"]]

        try:
            normalized[-1] = normalize_executor_identity({**normalized[-1], "executor_role_code": node.get("executor_role_code")})
        except ValueError as exc:
            raise TemplateWorkflowValidationError(str(exc), node_id=node_id) from exc

        if node_type == "result_reconsideration":
            try:
                normalized[-1] = normalize_result_reconsideration_executor(normalized[-1] | {"executor_config": node.get("executor_config")})
            except ValueError as exc:
                raise TemplateWorkflowValidationError(str(exc), node_id=node_id) from exc

    if not any(node["node_type"] == "evaluation" for node in normalized):
        raise TemplateWorkflowValidationError("流程至少需要一个评估型环节")
    for index, node in enumerate(normalized):
        if node["node_type"] == "result_reconsideration" and (
            index == 0 or normalized[index - 1]["node_type"] != "result_view"
        ):
            raise TemplateWorkflowValidationError("结果复议处理必须紧接绩效结果查看环节", node_id=node["node_id"])

    for node in normalized:
        allowed_roles = {
            other["executor_label"]
            for other in normalized
            if other["node_type"] == "evaluation"
            and other["node_id"] != node["node_id"]
            and other["executor_label"]
        }
        node["invite_executor_types"] = [
            role for role in node["invite_executor_types"] if role in allowed_roles
        ]

    reviewer_nodes = [
        node
        for node in normalized
        if node["node_type"] == "evaluation" and node["executor_label"] == REVIEWER_360_LABEL
    ]
    invalid_reviewer_nodes = [
        node
        for node in reviewer_nodes
        if node["allow_invite_other_executors"]
        and node["invite_executor_scope"] == INVITE_SCOPE_PARTIAL
        and not node["invite_executor_types"]
    ]
    if reviewer_nodes and len(invalid_reviewer_nodes) == len(reviewer_nodes):
        raise TemplateWorkflowValidationError(
            "请选择允许邀请的执行人角色",
            node_id=invalid_reviewer_nodes[0]["node_id"],
        )
    return normalized


def _validate_reference_contents(nodes: list[dict]) -> None:
    nodes_by_id = {str(node["node_id"]): node for node in nodes}
    for node in nodes:
        for content in node.get("content") or []:
            if (content.get("content_slot") or "fill") != "reference":
                continue
            # 引用视图自身的页面名称（只作用于该引用，不写回来源环节），任意参考项都可设置。
            page_name = (content.get("reference_settings") or {}).get("page_name")
            if page_name is not None:
                if not isinstance(page_name, str) or not page_name.strip() or len(page_name.strip()) > 100:
                    raise TemplateWorkflowValidationError(
                        "参考内容页面名称长度必须为 1-100",
                        node_id=node["node_id"],
                    )
                content["reference_settings"]["page_name"] = page_name.strip()
            if content.get("reference_kind") != "node":
                continue
            source_id = str(content.get("reference_value") or "")
            source = nodes_by_id.get(source_id)
            if source is None or source_id == node["node_id"] or source["node_type"] not in REFERENCE_SOURCE_NODE_TYPES or source.get("system"):
                raise TemplateWorkflowValidationError("参考内容来源环节不合法", node_id=node["node_id"])
            settings = content.get("reference_settings", {})
            if not isinstance(settings, dict) or not isinstance(settings.get("content_settings", {}), dict):
                raise TemplateWorkflowValidationError("参考内容查看设置不合法", node_id=node["node_id"])
            for override in settings.get("content_settings", {}).values():
                if not isinstance(override, dict) or not isinstance(override.get("root", {}), dict) or not isinstance(override.get("items", {}), dict):
                    raise TemplateWorkflowValidationError("参考内容查看设置不合法", node_id=node["node_id"])
                for display in [override.get("root", {}), *override.get("items", {}).values()]:
                    if not isinstance(display, dict) or any(type(display[key]) is not bool for key in ("allowView", "hideName", "hideDescription", "onlyWhenFilling") if key in display):
                        raise TemplateWorkflowValidationError("参考内容查看设置不合法", node_id=node["node_id"])
                    if any(key in display for key in ("mode", "required", "allowModify", "levelRulesEnabled", "allowMultiple", "allowUnknown")):
                        raise TemplateWorkflowValidationError("参考内容只能保存查看设置", node_id=node["node_id"])
            content.update(type="reference", name=source["name"], description=source.get("description") or "", items=[], reference_value=source_id)


def _content_region_ids(node: dict) -> list[str]:
    return ["result", *[
        f"reference:{_content_id(content)}"
        for content in node.get("content") or []
        if content.get("content_slot") == "reference"
    ]]


def _validate_content_region_order(node: dict) -> None:
    order = node.get("content_region_order")
    if order is None:
        return
    expected = _content_region_ids(node)
    if (
        node["node_type"] != "result_view"
        or not isinstance(order, list)
        or any(not isinstance(value, str) for value in order)
        or len(order) != len(expected)
        or len(set(order)) != len(order)
        or set(order) != set(expected)
    ):
        raise TemplateWorkflowValidationError("内容区域顺序不合法", node_id=node["node_id"])


def _validate_result_view_contents(nodes: list[dict], library: list[dict]) -> None:
    final_node = next(node for node in nodes if node["include_final_result"])
    contents_by_id = {content["content_id"]: content for content in library}
    fill_contents = {
        _content_id(content): content
        for content in final_node.get("content") or []
        if (content.get("content_slot") or "fill") == "fill"
    }
    fill_ids = set(fill_contents) | set(final_node["content_bindings"].get("fill") or [])
    allowed_ids = set()
    for content_id in fill_ids:
        content = fill_contents.get(content_id, contents_by_id.get(content_id))
        if content and content.get("type") != "prompt" and any(
            item.get("kind") != "prompt" and (item.get("settings") or {}).get("mode") != "hidden"
            for item in content.get("items") or []
        ):
            allowed_ids.add(content_id)

    executor_label = final_node["executor_label"]
    if executor_label == "实线上级":
        manager_labels = {
            "DIRECT_MANAGER": "直属上级",
            "LEVEL_1_MANAGER": "隔 1 级上级",
            "LEVEL_2_MANAGER": "隔 2 级上级",
            "LEVEL_3_MANAGER_PLUS": "隔 3 级上级及以上",
        }
        executor_label = "、".join(
            manager_labels[value]
            for value in final_node["executor_types"]
            if value in manager_labels
        ) or executor_label
    for node in nodes:
        if node["node_type"] != "result_view":
            continue
        local_prompt_ids = {
            _content_id(content)
            for content in node.get("content") or []
            if content.get("content_slot") == "view" and content.get("type") == "prompt"
        }
        view_ids = (set(node["content_bindings"].get("view") or []) - local_prompt_ids) | {
            _content_id(content)
            for content in node.get("content") or []
            if content.get("content_slot") == "view" and content.get("type") != "prompt"
        }
        if not view_ids.issubset(allowed_ids):
            raise TemplateWorkflowValidationError(
                f"仅可选择终评环节执行人「{executor_label}」填写的内容",
                node_id=node["node_id"],
            )


def _materialize_node_contents(node: dict, library: list[dict]) -> dict:
    """节点只存引用：按内容库把定义投影到节点内容上（环节级设置沿用节点自身）。"""
    resolved = deepcopy(node)
    by_id = {_content_id(content): content for content in library}
    contents: list[dict] = []
    for content in resolved.get("content") or []:
        is_reference = (content.get("content_slot") or "fill") == "reference" or content.get("type") == "reference"
        library_content = by_id.get(_content_id(content))
        contents.append(
            content if is_reference or library_content is None else _project_content(content, library_content)
        )
    existing = {(_content_id(content), content.get("content_slot") or "fill") for content in contents}
    for slot, content_ids in (resolved.get("content_bindings") or {}).items():
        for content_id in content_ids:
            key = (str(content_id), slot)
            if key not in existing and str(content_id) in by_id:
                contents.append({**deepcopy(by_id[str(content_id)]), "content_slot": slot})
                existing.add(key)
    if contents or "content" in resolved:
        resolved["content"] = contents
    return resolved


class PerformanceTemplateWorkflowService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_record(self, template_id: int) -> PerformanceTemplateWorkflow | None:
        return (
            await self.db.execute(
                select(PerformanceTemplateWorkflow).where(
                    PerformanceTemplateWorkflow.template_id == template_id
                )
            )
        ).scalar_one_or_none()

    async def usage_summary(self, template_id: int) -> tuple[int, int]:
        cycles = await self.db.scalar(select(func.count()).select_from(PerformanceCycle).where(or_(
            PerformanceCycle.template_id == template_id,
            PerformanceCycle.template_ids.contains([template_id]),
        )))
        projects = await self.db.scalar(select(func.count()).select_from(PerformanceProject).where(
            PerformanceProject.settings["template_id"].as_string() == str(template_id),
        ))
        return int(cycles or 0), int(projects or 0)

    async def lock_usage(self, template_id: int) -> None:
        await self.db.execute(select(PerformanceTemplate.id).where(
            PerformanceTemplate.id == template_id,
        ).with_for_update())
        await self.db.execute(select(PerformanceTemplateWorkflow).where(
            PerformanceTemplateWorkflow.template_id == template_id,
        ).with_for_update().execution_options(populate_existing=True))

    async def sync_project_display(self, template_id: int, nodes: list[dict], library: list[dict], previous_nodes: list[dict], previous_library: list[dict]) -> None:
        from app.performance.calibration_service import calibration_template

        await self.db.execute(select(PerformanceProject.id).where(
            PerformanceProject.settings["template_id"].as_string() == str(template_id),
        ).order_by(PerformanceProject.id).with_for_update())
        snapshots = (await self.db.execute(select(PerformanceProjectNodeSnapshot).join(
            PerformanceProject, PerformanceProject.id == PerformanceProjectNodeSnapshot.project_id,
        ).where(
            PerformanceProject.settings["template_id"].as_string() == str(template_id),
        ).order_by(PerformanceProjectNodeSnapshot.id).with_for_update(of=PerformanceProjectNodeSnapshot)
          .execution_options(populate_existing=True))).scalars().all()
        by_id = {node["node_id"]: node for node in nodes}
        old_by_id = {node["node_id"]: _materialize_node_contents(node, previous_library) for node in normalize_workflow_nodes(previous_nodes)}
        old_final = next((node for node in old_by_id.values() if node.get("include_final_result")), None)
        final = next((node for node in nodes if node.get("include_final_result")), None)
        for snapshot in snapshots:
            source = by_id.get(snapshot.node_id)
            previous = old_by_id.get(snapshot.node_id)
            if source is None or previous is None:
                continue
            if source["node_type"] == "calibration" and final is not None and old_final is not None:
                source = calibration_template(source, final, library)
                previous = calibration_template(previous, old_final, previous_library)
            config = deepcopy(snapshot.config or {})
            target = config.get("template")
            if not isinstance(target, dict):
                continue
            _sync_display(target, source, {"appeal_prompt_content", "appeal_reason_instruction", "show_result_and_modify", "name", "description", "content_page_name"}, previous)
            if source.get("name") != previous.get("name") and hasattr(snapshot, "name"):
                snapshot.name = source["name"]
            _sync_template_contents(target, source, previous)
            if source.get("content_region_order") != previous.get("content_region_order") and source.get("content_region_order") is not None:
                current_keys = {_content_id(content) for content in target.get("content") or [] if (content.get("content_slot") or "fill") == "reference"}
                old_order = target.get("content_region_order") or []
                incoming_order = source.get("content_region_order") or []
                result = [entry for entry in incoming_order if entry == "result" or entry.split(":", 1)[-1] in current_keys]
                result.extend(entry for entry in old_order if entry == "result" and entry not in result)
                target["content_region_order"] = result
            if config != snapshot.config:
                snapshot.config = config

    async def get_content_library(self, template_id: int) -> list[dict]:
        record = await self.get_record(template_id)
        if record is None:
            return []
        library = normalize_content_library(getattr(record, "content_library", None) or [])
        legacy_contents = [
            content
            for node in (record.nodes or [])
            for content in (node.get("content") or [])
            if not ((content.get("content_slot") or "fill") == "reference" or content.get("type") == "reference")
        ]
        return _fill_missing_contents(library, legacy_contents)

    async def get_nodes(self, template_id: int) -> tuple[list[dict], int, int]:
        record = await self.get_record(template_id)
        cycle_count, project_count = await self.usage_summary(template_id)
        if record is None:
            return default_workflow_nodes(), cycle_count, project_count
        library = await self.get_content_library(template_id)
        nodes = [_materialize_node_contents(node, library) for node in normalize_workflow_nodes(record.nodes)]
        return nodes, cycle_count, project_count

    async def save_nodes(
        self,
        template_id: int,
        nodes: list[dict],
        *,
        content_library: list[dict] | None = None,
        actor_type: str,
        actor_ref: str,
    ) -> PerformanceTemplateWorkflow:
        normalized = normalize_workflow_nodes(nodes)
        if sum(node["include_final_result"] for node in normalized) != 1:
            raise TemplateWorkflowValidationError("请且仅请选择一个环节作为最终结果")
        await self.lock_usage(template_id)
        record = await self.get_record(template_id)
        cycle_count, project_count = await self.usage_summary(template_id)
        used = cycle_count > 0 or project_count > 0
        existing_nodes = {
            str(node.get("node_id")): node
            for node in (record.nodes if record is not None else [])
            if node.get("node_id")
        }
        for raw_node, node in zip(nodes, normalized):
            existing_node = existing_nodes.get(node["node_id"])
            if "content_page_name" not in raw_node and existing_node is not None:
                node["content_page_name"] = _normalize_content_page_name(existing_node, node["node_id"])
            if node["node_type"] == "calibration" and "calibration_settings" not in raw_node and existing_node is not None:
                node["calibration_settings"] = deepcopy(existing_node.get("calibration_settings") or {})
        existing_library = getattr(record, "content_library", None) if record is not None else []
        incoming_library = normalize_content_library(content_library or [])
        if used and content_library is not None:
            previous_library = await self.get_content_library(template_id)
            if _locked_contents(incoming_library) != _locked_contents(previous_library):
                raise TemplateWorkflowLockedError("模板已被使用，不能修改内容结构或填写配置")
        node_contents = [
            content
            for node in normalized
            for content in (node.get("content") or [])
            if (content.get("content_slot") or "fill") == "fill" and content.get("type") != "reference"
        ]
        # 库为唯一权威：显式提交的内容库定义优先，旧库与节点上的填写内容只补缺口（兼容旧客户端）。
        library = _fill_missing_contents(incoming_library, [
            content for content in existing_library or []
            if content_library is None or not _display_only_content(content)
        ])
        library = _fill_missing_contents(library, node_contents)
        for node in normalized:
            bindings = deepcopy(node.get("content_bindings") or {})
            if not bindings:
                grouped: dict[str, list[str]] = {}
                for content in node.get("content") or []:
                    slot = str(content.get("content_slot") or "fill")
                    grouped.setdefault(slot, []).append(_content_id(content))
                bindings = grouped
            node["content_bindings"] = bindings
        if used:
            previous_nodes = (record.nodes if record is not None else None) or default_workflow_nodes()
            previous_library = await self.get_content_library(template_id)
            if _locked_nodes(previous_nodes, previous_library) != _locked_nodes(normalized, library):
                raise TemplateWorkflowLockedError("模板已被使用，不能修改流程结构或填写配置")
            previous_by_id = {node["node_id"]: node for node in _locked_nodes(previous_nodes, previous_library)}
            for node in normalized:
                previous_contents = {(content["content_id"], content["content_slot"]): content for content in previous_by_id[node["node_id"]]["content"]}
                for content in _locked_contents(node.get("content") or []):
                    if content != previous_contents.get((content["content_id"], content["content_slot"])):
                        raise TemplateWorkflowLockedError("模板已被使用，不能修改内容结构或填写配置")
        _validate_result_view_contents(normalized, library)
        normalized = [_materialize_node_contents(node, library) for node in normalized]
        _validate_reference_contents(normalized)
        for raw_node, node in zip(nodes, normalized):
            existing_node = existing_nodes.get(node["node_id"]) or {}
            if raw_node.get("content_region_order") is None and node["node_type"] == "result_view" and existing_node.get("content_region_order"):
                expected = _content_region_ids(node)
                previous = existing_node["content_region_order"]
                node["content_region_order"] = [value for value in previous if value in expected] + [value for value in expected if value not in previous]
            _validate_content_region_order(node)
        for node in normalized:
            library = _fill_missing_contents(library, [content for content in (node.get("content") or []) if not ((content.get("content_slot") or "fill") == "reference" or content.get("type") == "reference")])
        question_ids = review_question_ids([normalized, library])
        if question_ids:
            existing_question_ids = set((await self.db.execute(
                select(PerformanceReviewQuestion.id)
                .where(PerformanceReviewQuestion.id.in_(question_ids))
                .order_by(PerformanceReviewQuestion.id)
                .with_for_update(read=True)
            )).scalars().all())
            if question_ids - existing_question_ids:
                raise TemplateWorkflowValidationError("引用的评估题不存在或已被删除，请重新选择")
        before = deepcopy(record.nodes) if record is not None else []
        if record is None:
            record = PerformanceTemplateWorkflow(template_id=template_id, nodes=normalized, content_library=library)
            self.db.add(record)
        else:
            record.nodes = normalized
            record.content_library = library
        record.updated_by_type = actor_type
        record.updated_by_ref = actor_ref
        PerformanceAuditService(self.db).append_event(
            AuditEventInput(
                event_type="PERFORMANCE_TEMPLATE_WORKFLOW_UPDATED",
                actor_type=actor_type,
                actor_ref=actor_ref,
                subject_type="PERFORMANCE_TEMPLATE",
                subject_ref=str(template_id),
                before_state={"nodes": before},
                after_state={"nodes": normalized},
            )
        )
        record.cycle_count = cycle_count
        record.project_count = project_count
        try:
            if used:
                await self.sync_project_display(template_id, normalized, library, previous_nodes, previous_library)
            await self.db.commit()
        except Exception:
            await self.db.rollback()
            raise
        await self.db.refresh(record)
        return record
