"""Cycle comparison configuration and start-time snapshots."""
from collections import Counter
from copy import deepcopy
from uuid import uuid4

from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import exists, or_, select, update

from app.performance.assessment_roles import ROLE_REVIEWER_360, node_role_code
from app.performance.comparison_schema import ComparisonRule
from app.performance.models import (
    PerformanceAuditEvent, PerformanceComparisonNotification, PerformanceProject,
    PerformanceProjectNodeSnapshot, PerformanceTemplate, PerformanceTemplateWorkflow,
)
from app.performance.self_summary_service import (
    build_self_summary_schema, hydrate_self_summary_template,
    project_reference_content, resolve_self_summary_content,
)


def comparison_error(code, message, status_code=422):
    raise HTTPException(status_code=status_code, detail={"code": code, "message": message})


def started_project_condition():
    return or_(
        PerformanceProject.status.in_(["STARTED", "ARCHIVED"]),
        PerformanceProject.settings.has_key("comparison_rules_snapshot"),
        exists().where(PerformanceProjectNodeSnapshot.project_id == PerformanceProject.id),
    )


def rating_items(node):
    schema = build_self_summary_schema(node)
    counts = Counter(field["id"] for section in schema for field in section["fields"])
    content_counts = Counter(section["id"] for section in schema)
    raw_counts = Counter(
        str(item.get("id"))
        for content in node.get("content") or []
        if (content.get("content_slot") or "fill") == "fill"
        for item in content.get("items") or [] if item.get("id") is not None
    )
    ambiguous_contents = set()
    for index, content in enumerate(node.get("content") or []):
        if (content.get("content_slot") or "fill") != "fill":
            continue
        identity = str(content.get("content_id") or content.get("id") or index)
        raw_ids = [str(item.get("id") or "") for item in content.get("items") or [] if item.get("kind") != "prompt"]
        if not (content.get("content_id") or content.get("id")) or any(not value or raw_counts[value] > 1 for value in raw_ids):
            ambiguous_contents.add(identity)
    items, rejected = {}, {}
    for section in schema:
        for field in section["fields"]:
            if field["type"] != "rating" or field.get("readonly"):
                continue
            key = (section["id"], field["id"])
            reason = None
            if section["id"] in ambiguous_contents or counts[field["id"]] > 1 or content_counts[section["id"]] > 1:
                reason = "评估项 ID 在多个位置重复，无法唯一匹配"
            elif section.get("allow_multiple"):
                reason = "可重复内容缺少稳定实例身份，暂不支持跨环节对比"
            option_ids = [str(option["id"]) for option in field["options"]]
            if not option_ids:
                reason = "评级选项为空，无法比较档差"
            if reason:
                rejected[key] = reason
            else:
                items[key] = {"content_id": key[0], "item_id": key[1], "label": field["label"], "option_ids": option_ids}
    return items, rejected


def shared_items(first, second):
    first_items, first_rejected = rating_items(first)
    second_items, second_rejected = rating_items(second)
    items, rejected = [], {**first_rejected, **second_rejected}
    for key in first_items.keys() & second_items.keys():
        if key in rejected:
            continue
        if first_items[key]["option_ids"] != second_items[key]["option_ids"]:
            rejected[key] = "评级选项及顺序不一致"
        else:
            items.append(first_items[key])
    return sorted(items, key=lambda item: (item["content_id"], item["item_id"])), rejected


def direction_warnings(template_id, viewer, source, items):
    visible = set()
    for relation in viewer.get("content") or []:
        if relation.get("content_slot") != "reference" or relation.get("reference_kind") != "node" or str(relation.get("reference_value")) != str(source["node_id"]):
            continue
        schema, _ = project_reference_content(source, relation, {})
        visible.update((section["id"], field["id"]) for section in schema for field in section["fields"])
    return [
        {"template_id": template_id, "stage_id": viewer["node_id"], "ref_stage_id": source["node_id"],
         "content_id": item["content_id"], "item_id": item["item_id"], "message": "该方向无权查看参考环节评估项，不会触发差异提示"}
        for item in items if (item["content_id"], item["item_id"]) not in visible
    ]


class PerformanceComparisonConfigService:
    def __init__(self, db):
        self.db = db

    async def has_started_projects(self, cycle_ref):
        return bool((await self.db.execute(select(PerformanceProject.id).where(
            PerformanceProject.cycle_ref == cycle_ref, started_project_condition(),
        ).union(select(PerformanceAuditEvent.id).where(
            PerformanceAuditEvent.cycle_ref == cycle_ref,
            PerformanceAuditEvent.event_type == "PERFORMANCE_PROJECT_STARTED",
        )).limit(1))).scalar_one_or_none())

    async def load_nodes(self, template_id):
        workflow = await self.db.get(PerformanceTemplateWorkflow, template_id, populate_existing=True)
        result = {}
        for node in (workflow.nodes if workflow else []) or []:
            if node.get("node_type") != "evaluation" or node_role_code(node) in {None, ROLE_REVIEWER_360}:
                continue
            resolved = resolve_self_summary_content(node, workflow.content_library or [])
            hydrated = await hydrate_self_summary_template(resolved, self.db)
            valid, rejected = rating_items(hydrated)
            if valid or rejected:
                node_id = str(node.get("node_id") or "")
                if not node_id or node_id in result:
                    comparison_error("COMPARISON_ITEM_NOT_SHARED", "流程节点 ID 不唯一")
                result[node_id] = hydrated
        return result

    async def candidates(self, payload):
        templates, nodes_by_template = [], {}
        ids = list(dict.fromkeys(payload.template_ids))
        previous = []
        if payload.cycle_id is not None:
            from app.performance.models import PerformanceCycle
            cycle = await self.db.get(PerformanceCycle, payload.cycle_id)
            if cycle is None:
                raise HTTPException(status_code=404, detail="绩效周期不存在")
            previous = cycle.template_ids or ([cycle.template_id] if cycle.template_id else [])
        for template_id in ids:
            template = await self.db.get(PerformanceTemplate, template_id)
            if template is None or template.template_kind != "performance" or (template.status != "active" and template_id not in previous):
                comparison_error("COMPARISON_ITEM_NOT_SHARED", "只能选择已启用的绩效模板")
            nodes = await self.load_nodes(template_id)
            nodes_by_template[template_id] = nodes
            templates.append({"template_id": template_id, "name": template.name,
                              "stages": [{"node_id": key, "name": node.get("name") or key} for key, node in nodes.items()]})
        response = {"templates": templates, "items": [], "warnings": []}
        if not payload.first_node_id and not payload.second_node_id:
            return response
        template_id = payload.template_id or (ids[0] if len(ids) == 1 else None)
        nodes = nodes_by_template.get(template_id, {})
        if payload.first_node_id == payload.second_node_id or payload.first_node_id not in nodes or payload.second_node_id not in nodes:
            comparison_error("COMPARISON_ITEM_NOT_SHARED", "请选择同一模板内两个有效评估环节")
        first, second = nodes[payload.first_node_id], nodes[payload.second_node_id]
        items, rejected = shared_items(first, second)
        response["items"] = items
        response["warnings"] = [
            {"template_id": template_id, "stage_id": first["node_id"], "ref_stage_id": second["node_id"],
             "content_id": key[0], "item_id": key[1], "message": message}
            for key, message in sorted(rejected.items())
        ] + direction_warnings(template_id, first, second, items) + direction_warnings(template_id, second, first, items)
        return response

    async def validate_rule(self, rule, template_ids):
        if rule["template_id"] not in template_ids:
            comparison_error("COMPARISON_ITEM_NOT_SHARED", "差异规则模板不属于当前周期")
        await self.db.get(PerformanceTemplate, rule["template_id"], with_for_update=True, populate_existing=True)
        nodes = await self.load_nodes(rule["template_id"])
        first, second = nodes.get(rule["first_node_id"]), nodes.get(rule["second_node_id"])
        if first is None or second is None:
            comparison_error("COMPARISON_ITEM_NOT_SHARED", "差异规则必须选择有效非360评估环节")
        items, rejected = shared_items(first, second)
        by_key = {(item["content_id"], item["item_id"]): item for item in items}
        frozen = deepcopy(rule)
        for indicator in frozen["indicator_diff_rules"]:
            key = (indicator["content_id"], indicator["item_id"])
            if key not in by_key:
                reason = rejected.get(key, "两个环节不存在此共有可填写评级项")
                code = "COMPARISON_OPTIONS_MISMATCH" if reason == "评级选项及顺序不一致" else "COMPARISON_ITEM_NOT_SHARED"
                comparison_error(code, reason)
            indicator["option_ids"] = list(by_key[key]["option_ids"])
        return frozen

    async def normalize_rules(self, rules, template_ids, previous=()):
        if not isinstance(rules, list) or len(rules) > 1:
            comparison_error("COMPARISON_ITEM_NOT_SHARED", "每周期至多配置一组差异规则")
        normalized = []
        for value in rules:
            try:
                rule = ComparisonRule.model_validate(value).model_dump()
            except ValidationError as exc:
                comparison_error("COMPARISON_ITEM_NOT_SHARED", str(exc))
            previous_id = previous[0]["id"] if previous else None
            if rule["id"] is not None and rule["id"] != previous_id:
                comparison_error("COMPARISON_RULES_VERSION_CONFLICT", "规则身份已失效，请刷新后重试", 409)
            rule["id"] = previous_id or uuid4().hex
            await self.validate_rule(rule, template_ids)
            normalized.append(rule)
        return normalized

    async def update_rules(self, cycle, payload, template_ids):
        if "semester_diff_rules" not in payload:
            active = getattr(cycle, "semester_diff_rules", None) or []
            if any(rule["template_id"] not in template_ids for rule in active):
                comparison_error("COMPARISON_ITEM_NOT_SHARED", "请先删除使用该模板的差异规则")
            return
        revision = getattr(cycle, "comparison_rules_revision", 0) or 0
        if payload.get("comparison_rules_revision") != revision:
            comparison_error("COMPARISON_RULES_VERSION_CONFLICT", "规则已变更，请刷新后重试", 409)
        previous = getattr(cycle, "semester_diff_rules", None) or []
        incoming = payload["semester_diff_rules"]
        if not isinstance(incoming, list) or len(incoming) > 1:
            comparison_error("COMPARISON_ITEM_NOT_SHARED", "每周期至多配置一组差异规则")
        # Same-value saves remain possible after start, even if the live template changed.
        comparable = []
        for value in incoming:
            try:
                rule = ComparisonRule.model_validate(value).model_dump()
            except ValidationError as exc:
                comparison_error("COMPARISON_ITEM_NOT_SHARED", str(exc))
            if previous and rule["id"] is None:
                rule["id"] = previous[0]["id"]
            comparable.append(rule)
        if comparable == previous:
            if any(rule["template_id"] not in template_ids for rule in previous):
                comparison_error("COMPARISON_ITEM_NOT_SHARED", "请先删除使用该模板的差异规则")
            return
        if incoming and await self.has_started_projects(cycle.cycle_ref):
            comparison_error("COMPARISON_RULES_LOCKED", "周期下项目曾启动，仅允许删除差异规则", 409)
        normalized = await self.normalize_rules(incoming, template_ids, previous)
        removed = {rule["id"] for rule in previous} - {rule["id"] for rule in normalized}
        if removed:
            await self.db.execute(update(PerformanceComparisonNotification).where(
                PerformanceComparisonNotification.cycle_ref == cycle.cycle_ref,
                PerformanceComparisonNotification.rule_id.in_(removed),
                PerformanceComparisonNotification.status.in_(["pending", "retrying"]),
            ).values(status="skipped", last_error="comparison rule deleted"))
        cycle.semester_diff_rules = normalized
        cycle.comparison_rules_revision = revision + 1

    async def snapshot(self, cycle, template_id):
        rules = []
        for rule in getattr(cycle, "semester_diff_rules", None) or []:
            if rule["template_id"] == template_id:
                rules.append(await self.validate_rule(rule, [template_id]))
        return {"version": 1, "rules": rules}
