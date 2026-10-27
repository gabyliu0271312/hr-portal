"""Persistence and canonical validation for performance template workflows."""
from __future__ import annotations

from copy import deepcopy
import re
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.performance.authorization_service import AuditEventInput, PerformanceAuditService
from app.performance.models import PerformanceTemplateWorkflow
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
SHARED_MANAGER_EXECUTOR_LABELS = {"实线上级", "虚线上级"}
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
    merged = {content["content_id"]: content for content in normalize_content_library(library)}
    for raw in contents:
        if raw.get("type") == "reference" and raw.get("reference_kind") == "node":
            continue
        content = _normalize_content(raw)
        content["content_id"] = _content_id(content)
        content.pop("content_slot", None)
        merged.setdefault(content["content_id"], content)
    return list(merged.values())


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
        elif node_type == "evaluation" and executor_label == "被评估人":
            executor_types = ["SUBJECT"]
        elif node_type in SHARED_MANAGER_EXECUTOR_NODE_TYPES:
            if executor_label not in SHARED_MANAGER_EXECUTOR_LABELS:
                executor_label = "实线上级"
            if node_type == "reviewer_360_confirm":
                executor_types = [
                    value for value in executor_types
                    if value in REVIEWER_360_CONFIRM_MANAGER_TYPES
                ]
            if executor_label == "实线上级" and not executor_types:
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
            if (content.get("content_slot") or "fill") != "reference" or content.get("reference_kind") != "node":
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
    resolved = deepcopy(node)
    contents = resolved.get("content") or []
    existing = {(_content_id(content), content.get("content_slot") or "fill") for content in contents}
    by_id = {_content_id(content): content for content in library}
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

    async def get_content_library(self, template_id: int) -> list[dict]:
        record = await self.get_record(template_id)
        if record is None:
            return []
        library = normalize_content_library(getattr(record, "content_library", None) or [])
        legacy_contents = [content for node in (record.nodes or []) for content in (node.get("content") or [])]
        return _merge_content_library(library, legacy_contents)

    async def get_nodes(self, template_id: int) -> tuple[list[dict], int, int]:
        record = await self.get_record(template_id)
        if record is None:
            return default_workflow_nodes(), 0, 0
        library = normalize_content_library(getattr(record, "content_library", None) or [])
        nodes = [_materialize_node_contents(node, library) for node in normalize_workflow_nodes(record.nodes)]
        return nodes, record.cycle_count, record.project_count

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
        record = await self.get_record(template_id)
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
        library = normalize_content_library(content_library or [])
        source_library = _merge_content_library(library, existing_library or [])
        library = _merge_content_library(existing_library or [], library)
        for node in normalized:
            bindings = deepcopy(node.get("content_bindings") or {})
            if not bindings:
                grouped: dict[str, list[str]] = {}
                for content in node.get("content") or []:
                    slot = str(content.get("content_slot") or "fill")
                    grouped.setdefault(slot, []).append(_content_id(content))
                bindings = grouped
            node["content_bindings"] = bindings
        _validate_result_view_contents(normalized, source_library)
        normalized = [_materialize_node_contents(node, source_library) for node in normalized]
        _validate_reference_contents(normalized)
        for raw_node, node in zip(nodes, normalized):
            existing_node = existing_nodes.get(node["node_id"]) or {}
            if raw_node.get("content_region_order") is None and node["node_type"] == "result_view" and existing_node.get("content_region_order"):
                expected = _content_region_ids(node)
                previous = existing_node["content_region_order"]
                node["content_region_order"] = [value for value in previous if value in expected] + [value for value in expected if value not in previous]
            _validate_content_region_order(node)
        for node in normalized:
            library = _merge_content_library(library, [content for content in (node.get("content") or []) if not ((content.get("content_slot") or "fill") == "reference" and content.get("type") == "reference" and content.get("reference_kind") == "node")])
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
        await self.db.commit()
        await self.db.refresh(record)
        return record
