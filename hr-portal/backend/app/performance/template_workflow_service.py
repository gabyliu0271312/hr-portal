"""Persistence and canonical validation for performance template workflows."""
from __future__ import annotations

from copy import deepcopy
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
            }
        )

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

    async def get_nodes(self, template_id: int) -> tuple[list[dict], int, int]:
        record = await self.get_record(template_id)
        if record is None:
            return default_workflow_nodes(), 0, 0
        return normalize_workflow_nodes(record.nodes), record.cycle_count, record.project_count

    async def save_nodes(
        self,
        template_id: int,
        nodes: list[dict],
        *,
        actor_type: str,
        actor_ref: str,
    ) -> PerformanceTemplateWorkflow:
        normalized = normalize_workflow_nodes(nodes)
        record = await self.get_record(template_id)
        before = deepcopy(record.nodes) if record is not None else []
        if record is None:
            record = PerformanceTemplateWorkflow(template_id=template_id, nodes=normalized)
            self.db.add(record)
        else:
            record.nodes = normalized
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
