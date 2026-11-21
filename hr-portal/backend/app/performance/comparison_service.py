"""Frozen cross-stage rating comparison and authorized projections."""
from copy import deepcopy
import hashlib
import json
import operator

from fastapi import HTTPException
from sqlalchemy import select

from app.performance.assessment_roles import ROLE_REVIEWER_360, node_role_code
from app.performance.models import PerformanceCycle, PerformanceNodeTask, PerformanceProjectMember, PerformanceProjectNodeSnapshot
from app.performance.self_summary_service import build_self_summary_schema, project_reference_content
from app.performance import shared_result_service as shared_results


_OPERATORS = {"eq": operator.eq, "gt": operator.gt, "gte": operator.ge, "lt": operator.lt, "lte": operator.le}
_PUBLIC_KEYS = ("rule_id", "show_notice_in_review", "fill_in_diff_reason", "reason_required", "context", "reason")


def _digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()).hexdigest()


def _field(schema, content_id, item_id):
    sections = [section for section in schema if str(section.get("id")) == content_id and not section.get("allow_multiple")]
    fields = [field for section in sections for field in section.get("fields", []) if str(field.get("id")) == item_id and field.get("type") == "rating"]
    if len(fields) != 1 or sum(str(field.get("id")) == item_id for section in schema for field in section.get("fields", [])) != 1:
        return None
    return fields[0]


def _value(value, option_ids):
    if isinstance(value, dict):
        value = value.get("id") or value.get("value") or value.get("option_id")
    return str(value) if value is not None and str(value) in option_ids else None


def _rating_projection(field, value):
    option = next((option for option in field.get("options") or [] if str(option.get("id")) == str(value)), None)
    if option is None or not isinstance(option.get("label"), str) or not option["label"]:
        return None
    return {key: option[key] for key in ("label", "code", "color", "foreground") if isinstance(option.get(key), str)}


async def _match_reviewers(db, task, project, records, projected):
    if not projected or not projected.get("matches"):
        return {}
    from app.performance.models import PerformanceAuditEvent, PerformanceAuthorizationSnapshotPerson, PerformanceProjectMemberSnapshot

    by_identity = {(node_id, record["task_id"], record["version"]): record
                   for node_id, node_records in records.items() for record in node_records}
    matched_records = {}
    for match in projected["matches"]:
        for side in ("first", "second"):
            identity = (match[f"{side}_node_id"], match[f"{side}_task_id"], match[f"{side}_version"])
            record = by_identity.get(identity)
            if record is not None and record.get("formal") and not record.get("anonymous"):
                matched_records[identity] = record
    if not matched_records:
        return {}

    actor_refs = {identity: str(record["submitter_ref"]) for identity, record in matched_records.items()
                  if record.get("submitter_type") == "EMPLOYEE" and record.get("submitter_ref")}
    task_ids = {str(record["task_id"]): identity for identity, record in matched_records.items()
                if not record.get("shared")}
    if task_ids:
        events = list((await db.execute(select(PerformanceAuditEvent).where(
            PerformanceAuditEvent.cycle_ref == task.cycle_ref,
            PerformanceAuditEvent.employee_no == task.target_employee_no,
            PerformanceAuditEvent.subject_type == "PERFORMANCE_NODE_TASK",
            PerformanceAuditEvent.subject_ref.in_(list(task_ids)),
            PerformanceAuditEvent.event_type.in_(["PERFORMANCE_TASK_SUBMITTED", "CALIBRATION_ADJUSTED"]),
        ).order_by(PerformanceAuditEvent.event_at.desc(), PerformanceAuditEvent.id.desc()))).scalars().all())
        seen = set()
        for event in events:
            identity = task_ids.get(str(event.subject_ref))
            record = matched_records.get(identity) if identity is not None else None
            if record is None or identity in seen:
                continue
            seen.add(identity)
            after = event.after_state or {}
            if (event.event_type != "PERFORMANCE_TASK_SUBMITTED" or after.get("project_id") != project.id
                    or after.get("node_id") != identity[0] or after.get("version") != record["version"]):
                continue
            switch = after.get("identity_switch") or {}
            if event.actor_type == "EMPLOYEE":
                actor_refs[identity] = str(event.actor_ref)
            elif switch.get("business_actor_type") == "EMPLOYEE" and switch.get("business_actor_ref"):
                actor_refs[identity] = str(switch["business_actor_ref"])
    if not actor_refs:
        return {}
    people = list((await db.execute(select(
        PerformanceAuthorizationSnapshotPerson.employee_no,
        PerformanceAuthorizationSnapshotPerson.display_name,
    ).join(PerformanceProjectMemberSnapshot,
        PerformanceProjectMemberSnapshot.source_snapshot_id == PerformanceAuthorizationSnapshotPerson.snapshot_id,
    ).where(
        PerformanceProjectMemberSnapshot.id == task.member_snapshot_id,
        PerformanceProjectMemberSnapshot.project_id == project.id,
        PerformanceAuthorizationSnapshotPerson.employee_no.in_(set(actor_refs.values())),
    ))).all())
    names = {str(employee_no): display_name.strip() for employee_no, display_name in people
             if display_name and display_name.strip()}
    return {identity: {"display_name": names[actor_ref]} for identity, actor_ref in actor_refs.items()
            if actor_ref in names}


def ordinary_evaluation(node):
    template = (node.config or {}).get("template") or {}
    return node.node_type == "evaluation" and node_role_code({"node_type": node.node_type, **template}) != ROLE_REVIEWER_360


def active_rules(project, cycle):
    snapshot = (getattr(project, "settings", None) or {}).get("comparison_rules_snapshot") or {}
    if snapshot.get("version") != 1:
        return []
    active = {rule.get("id") for rule in (getattr(cycle, "semester_diff_rules", None) or [])}
    template_id = (project.settings or {}).get("template_id")
    return [rule for rule in snapshot.get("rules", []) if rule.get("id") in active and str(rule.get("template_id")) == str(template_id)]


def _stored_groups(state):
    if not state:
        return {}
    groups = state.get("groups")
    if isinstance(groups, dict):
        return {str(key): value for key, value in groups.items() if isinstance(value, dict)}
    if isinstance(groups, list):
        return {str(value.get("rule_id")): value for value in groups if isinstance(value, dict) and value.get("rule_id")}
    if state.get("rule_id"):
        return {str(state["rule_id"]): state}
    return {}


def _envelope(groups, *, active=True, historical=False):
    result = deepcopy(groups[0]) if len(groups) == 1 else {
        "matches": [deepcopy(match) for group in groups for match in group.get("matches", [])],
        "show_notice_in_review": any(group.get("show_notice_in_review") for group in groups),
        "fill_in_diff_reason": any(group.get("fill_in_diff_reason") for group in groups),
        "reason_required": any(group.get("reason_required") for group in groups),
        "context": _digest([[group["rule_id"], group.get("context")] for group in groups]),
    }
    result.update(groups=groups, active=active, historical=historical)
    return result


def _grouped(value):
    if value is None:
        return []
    groups = value.get("groups") if isinstance(value, dict) else None
    return groups if isinstance(groups, list) else ([value] if isinstance(value, dict) and value.get("rule_id") else [])


def compare_ratings(rule, records, previous=None):
    """Compare every formal result pair, using only frozen option order."""
    matches, combinations, contexts = [], [], []
    first_id, second_id = rule["first_node_id"], rule["second_node_id"]
    for indicator in rule.get("indicator_diff_rules", []):
        content_id, item_id = str(indicator["content_id"]), str(indicator["item_id"])
        option_ids = [str(value) for value in indicator.get("option_ids", [])]
        if not option_ids or len(option_ids) != len(set(option_ids)):
            continue
        for first in records.get(first_id, []):
            for second in records.get(second_id, []):
                first_field = _field(first["schema"], content_id, item_id)
                second_field = _field(second["schema"], content_id, item_id)
                if first_field is None or second_field is None:
                    continue
                a, b = _value(first["answers"].get(item_id), option_ids), _value(second["answers"].get(item_id), option_ids)
                identity = [content_id, item_id, first.get("identity", first["task_id"]), second.get("identity", second["task_id"])]
                combinations.append([*identity, a, b])
                contexts.append([*identity, a, b, first["version"], second["version"]])
                if a is None or b is None:
                    continue
                difference = abs(option_ids.index(a) - option_ids.index(b))
                if not _OPERATORS[indicator["operator"]](difference, indicator["threshold"]):
                    continue
                hidden_name = first_field.get("hide_name") or second_field.get("hide_name")
                matches.append({"content_id": content_id, "item_id": item_id,
                    "label": "" if hidden_name else first_field.get("label", ""),
                    "operator": indicator["operator"], "threshold": indicator["threshold"], "difference": difference,
                    "first_node_id": first_id, "second_node_id": second_id,
                    "first_task_id": first["task_id"], "second_task_id": second["task_id"],
                    "first_version": first["version"], "second_version": second["version"],
                    "first_value": a, "second_value": b})
    signature = _digest([rule["id"], sorted(combinations, key=lambda item: json.dumps(item, sort_keys=True))])
    previous = previous or {}
    sequence = previous.get("event_sequence", 0) + (signature != previous.get("rating_signature"))
    return {"rule_id": rule["id"], "first_node_id": first_id, "second_node_id": second_id,
        "matches": matches, "show_notice_in_review": bool(rule.get("show_notice_in_review")),
        "fill_in_diff_reason": bool(rule.get("fill_in_diff_reason")), "reason_required": bool(rule.get("fill_in_diff_reason") and rule.get("diff_reason_required", True)),
        "send_notification": bool(rule.get("send_notification")), "context": _digest([rule, contexts]),
        "rating_signature": signature, "previous_rating_signature": previous.get("rating_signature"),
        "event_sequence": sequence, "reason": previous.get("reason"), "_contexts": contexts,
        "_indicators": [{"content_id": str(indicator["content_id"]), "item_id": str(indicator["item_id"])} for indicator in rule.get("indicator_diff_rules", [])]}


def project_comparison(comparison, schemas, current_node_id=None):
    if comparison is None:
        return None
    first_id, second_id = comparison["first_node_id"], comparison["second_node_id"]
    first_schema, second_schema = schemas.get(first_id, []), schemas.get(second_id, [])
    matches = []
    for match in comparison["matches"]:
        first = _field(first_schema, match["content_id"], match["item_id"])
        second = _field(second_schema, match["content_id"], match["item_id"])
        if first is None or second is None:
            continue
        visible = deepcopy(match)
        visible["label"] = "" if first.get("hide_name") or second.get("hide_name") else first.get("label", "")
        visible["first_rating"] = _rating_projection(first, match.get("first_value"))
        visible["second_rating"] = _rating_projection(second, match.get("second_value"))
        visible["first_reviewer"] = None
        visible["second_reviewer"] = None
        source_is_first = current_node_id == second_id
        visible["source_task_id"] = visible["first_task_id" if source_is_first else "second_task_id"]
        visible["source_version"] = visible["first_version" if source_is_first else "second_version"]
        matches.append(visible)
    contexts = [item for item in comparison.get("_contexts", []) if _field(first_schema, item[0], item[1]) and _field(second_schema, item[0], item[1])]
    if not contexts and not matches:
        allowed = any(_field(first_schema, item["content_id"], item["item_id"]) and _field(second_schema, item["content_id"], item["item_id"]) for item in comparison.get("_indicators", []))
        if not allowed:
            return None
    result = {key: deepcopy(comparison.get(key)) for key in _PUBLIC_KEYS}
    result.update(matches=matches, context=_digest([comparison["rule_id"], contexts]))
    result["reason_required"] = bool(matches and comparison["reason_required"])
    # A group reason may describe a hidden condition; never expose it partially.
    if len(matches) != len(comparison["matches"]):
        result["reason"] = None
    return result


async def evaluate_task(db, task, node, project, answers=None, *, viewer_template=None, viewer_schemas=None, all_formal=None, include_history=False,
                        result_context=None, templates=None):
    if all_formal is None:
        all_formal = answers is None
    if project is None or not ordinary_evaluation(node):
        return None, None
    snapshot = (getattr(project, "settings", None) or {}).get("comparison_rules_snapshot") or {}
    if not snapshot.get("rules"):
        return None, None
    if result_context is not None:
        if (task.project_id != project.id or task.cycle_ref != project.cycle_ref or node.project_id != project.id
                or task.node_snapshot_id != node.id or task.revoked_at is not None):
            return None, None
        context_nodes, context_tasks, context_member = result_context
        context_nodes = [candidate for candidate in context_nodes if candidate.project_id == project.id]
        context_node_ids = {candidate.id for candidate in context_nodes}
        context_tasks = sorted((source for source in context_tasks
            if source.project_id == project.id and source.cycle_ref == task.cycle_ref
            and source.member_snapshot_id == task.member_snapshot_id and source.target_employee_no == task.target_employee_no
            and source.revoked_at is None and source.node_snapshot_id in context_node_ids), key=lambda source: source.id)
        if context_member is not None and (context_member.snapshot_id != task.member_snapshot_id
                or context_member.employee_no != task.target_employee_no):
            context_member = None
        result_context = (context_nodes, context_tasks, context_member)
    cycle = await db.scalar(select(PerformanceCycle).where(PerformanceCycle.cycle_ref == project.cycle_ref))
    rules = [rule for rule in active_rules(project, cycle) if node.node_id in (rule["first_node_id"], rule["second_node_id"])]
    active_ids = {str(rule["id"]) for rule in rules}
    saved_groups = _stored_groups(getattr(task, "comparison_state", None))
    internal_groups, projected_groups = [], []
    for rule in snapshot.get("rules", []):
        if node.node_id not in (rule["first_node_id"], rule["second_node_id"]):
            continue
        saved = saved_groups.get(str(rule["id"]), {})
        historical = None
        if str(rule["id"]) not in active_ids:
            if not include_history or not saved.get("reason") or not saved.get("matches"):
                continue
            historical = deepcopy(saved)
        internal, projected = await _evaluate_rule(db, task, node, project, rule, saved, historical, answers,
            viewer_template=viewer_template, viewer_schemas=viewer_schemas, all_formal=all_formal,
            result_context=result_context, templates=templates)
        if internal is not None:
            internal_groups.append(internal)
        if projected is not None:
            projected_groups.append(projected)
    return (_envelope(internal_groups) if internal_groups else None,
            _envelope(projected_groups, active=any(group.get("active") for group in projected_groups),
                      historical=all(group.get("historical") for group in projected_groups)) if projected_groups else None)


async def _evaluate_rule(db, task, node, project, rule, previous, historical, answers,
                         *, viewer_template=None, viewer_schemas=None, all_formal=False, result_context=None, templates=None):
    from app.performance import projects_router as routes
    if result_context is None:
        nodes = list((await db.execute(select(PerformanceProjectNodeSnapshot).where(
            PerformanceProjectNodeSnapshot.project_id == project.id,
            PerformanceProjectNodeSnapshot.node_id.in_([rule["first_node_id"], rule["second_node_id"]]),
        ))).scalars().all())
    else:
        nodes = [candidate for candidate in result_context[0]
                 if candidate.project_id == project.id and candidate.node_id in (rule["first_node_id"], rule["second_node_id"])]
    nodes = [candidate for candidate in nodes if ordinary_evaluation(candidate)]
    if len(nodes) != 2:
        return None, None
    if result_context is None:
        tasks = list((await db.execute(select(PerformanceNodeTask).where(
            PerformanceNodeTask.project_id == project.id, PerformanceNodeTask.cycle_ref == task.cycle_ref,
            PerformanceNodeTask.member_snapshot_id == task.member_snapshot_id,
            PerformanceNodeTask.target_employee_no == task.target_employee_no,
            PerformanceNodeTask.node_snapshot_id.in_([candidate.id for candidate in nodes]),
            PerformanceNodeTask.revoked_at.is_(None),
        ).order_by(PerformanceNodeTask.id))).scalars().all())
    else:
        tasks = [source for source in result_context[1] if source.node_snapshot_id in {candidate.id for candidate in nodes}]
    node_templates, records = {}, {}
    for candidate in nodes:
        candidate_tasks = [source for source in tasks if source.node_snapshot_id == candidate.id]
        if candidate.id == node.id and not all_formal:
            candidate_tasks = [task]
        template = templates.get(candidate.id) if templates is not None else None
        if template is None:
            template = await routes._reference_template(next(iter(candidate_tasks), None), candidate, project, db)
            if templates is not None:
                templates[candidate.id] = template
        node_templates[candidate.node_id] = template
        records[candidate.node_id] = []
        shared_seen = False
        if answers is not None and candidate.id == node.id:
            candidate_tasks.sort(key=lambda source: source.id != task.id)
        for source in candidate_tasks:
            is_current = source.id == task.id
            shared = shared_results.participates(source, candidate)
            if shared and shared_seen:
                continue
            if is_current and answers is not None:
                schema = build_self_summary_schema(template)
                visible_answers = answers
                revision = task.answer_version
            else:
                if source.submitted_at is None or source.status != "completed":
                    continue
                source_options = {"result_context": result_context} if result_context is not None else {}
                schema, visible_answers = await routes._task_visible_content(source, candidate, db, template=template, **source_options)
                revision = source.answer_version
            shared_seen = shared_seen or shared
            record = {"task_id": source.id, "version": revision, "schema": schema, "answers": visible_answers,
                      "formal": not (is_current and answers is not None) and source.status == "completed" and source.submitted_at is not None,
                      "shared": shared, "anonymous": template.get("executor_label") == "360°评估人"}
            if shared:
                member = result_context[2] if result_context is not None else None
                if member is None:
                    member = await db.scalar(select(PerformanceProjectMember).where(PerformanceProjectMember.snapshot_id == source.member_snapshot_id, PerformanceProjectMember.employee_no == source.target_employee_no))
                state = getattr(member, "shared_result_state", None) or {}
                if not (is_current and answers is not None):
                    record["version"] = state.get("revision", revision)
                    record["task_id"] = state.get("source_task_id") or source.id
                    if state.get("submitted_at") and state.get("source_task_id") and state.get("revision") is not None:
                        record["submitter_type"] = state.get("source_actor_type")
                        record["submitter_ref"] = state.get("source_actor_ref")
                record["identity"] = f"shared:{task.member_snapshot_id}:{candidate.node_id}"
            records[candidate.node_id].append(record)
    if answers is not None and not all_formal:
        # Other evaluators at the current node are not the result being submitted.
        records[node.node_id] = [record for record in records[node.node_id] if record["task_id"] == task.id]
    comparison = compare_ratings(rule, records, previous)
    schemas = viewer_schemas
    if schemas is None:
        viewer_template = viewer_template if viewer_template is not None else node_templates[node.node_id]
        schemas = {}
        for node_id, template in node_templates.items():
            if node_id == node.node_id and viewer_template is node_templates[node.node_id]:
                schemas[node_id] = build_self_summary_schema(template)
            elif node_id == node.node_id and viewer_template == node_templates[node.node_id]:
                schemas[node_id] = build_self_summary_schema(template)
            else:
                relation = next((content for content in viewer_template.get("content", []) if content.get("content_slot") == "reference" and content.get("reference_kind") == "node" and str(content.get("reference_value")) == node_id), None)
                schemas[node_id] = project_reference_content(template, relation, {})[0] if relation is not None else []
    names = {}
    for candidate in nodes:
        if viewer_template is not None and viewer_template != node_templates[node.node_id]:
            relation = next((content for content in viewer_template.get("content", []) if content.get("content_slot") == "reference" and content.get("reference_kind") == "node" and str(content.get("reference_value")) == candidate.node_id), {})
        elif candidate.node_id != node.node_id:
            relation = next((content for content in node_templates[node.node_id].get("content", []) if content.get("content_slot") == "reference" and content.get("reference_kind") == "node" and str(content.get("reference_value")) == candidate.node_id), {})
        else:
            relation = {}
        names[candidate.node_id] = (relation.get("reference_settings") or {}).get("page_name") or candidate.name
    def with_names(result):
        if result is not None:
            for match in result["matches"]:
                match["first_node_name"] = names.get(rule["first_node_id"], "")
                match["second_node_name"] = names.get(rule["second_node_id"], "")
                match["reference_node_name"] = names.get(rule["first_node_id"] if node.node_id == rule["second_node_id"] else rule["second_node_id"], "")
        return result
    if historical is not None:
        historical.update(active=False, show_notice_in_review=False, fill_in_diff_reason=False, reason_required=False)
        projected = project_comparison(historical, schemas, node.node_id)
        if projected is not None and projected.get("reason"):
            projected.update(active=False, historical=True)
            return None, with_names(projected)
        return None, None
    projected = project_comparison(comparison, schemas, node.node_id)
    if projected is not None:
        projected.update(active=True, historical=False)
        reviewers = await _match_reviewers(db, task, project, records, projected)
        for match in projected["matches"]:
            for side in ("first", "second"):
                identity = (match[f"{side}_node_id"], match[f"{side}_task_id"], match[f"{side}_version"])
                match[f"{side}_reviewer"] = reviewers.get(identity)
    return comparison, with_names(projected)


def set_actor_draft(task, actor_ref, reason, context=None, *, comparison_reasons=None, comparison=None):
    state = deepcopy(getattr(task, "comparison_state", None) or {})
    drafts = state.get("actor_drafts") or {}
    actor_ref = str(actor_ref)
    if comparison_reasons is not None:
        allowed = {str(group["rule_id"]) for group in _grouped(comparison) if group.get("active", True)}
        entries = _reason_entries(comparison_reasons, allowed)
        groups = deepcopy((drafts.get(actor_ref) or {}).get("groups") or {})
        for rule_id, entry in entries.items():
            text = (entry.get("diff_reason") or "").strip()
            if text:
                groups[rule_id] = {"reason": entry["diff_reason"], "context": entry.get("comparison_context")}
            else:
                groups.pop(rule_id, None)
        if groups:
            drafts[actor_ref] = {"groups": groups}
        else:
            drafts.pop(actor_ref, None)
    elif reason is None or not reason.strip():
        drafts.pop(actor_ref, None)
    else:
        groups = [group for group in _grouped(comparison) if group.get("active", True)]
        if comparison is not None and len(groups) > 1:
            raise HTTPException(400, "COMPARISON_REASONS_REQUIRED")
        entry = {"reason": reason, "context": context}
        drafts[actor_ref] = {"groups": {str(groups[0]["rule_id"]): entry}} if groups else entry
    if drafts:
        state["actor_drafts"] = drafts
    else:
        state.pop("actor_drafts", None)
    task.comparison_state = state or None


def actor_draft_projection(task, actor_ref, comparison):
    entry = ((getattr(task, "comparison_state", None) or {}).get("actor_drafts") or {}).get(str(actor_ref)) if comparison is not None and comparison.get("active", True) else None
    groups = [group for group in _grouped(comparison) if group.get("active", True)]
    saved = (entry or {}).get("groups") or {}
    reasons = []
    for group in groups:
        draft = saved.get(str(group["rule_id"]))
        if draft is None and len(groups) == 1 and entry and "reason" in entry:
            draft = entry
        if draft:
            reasons.append({"rule_id": group["rule_id"], "diff_reason": draft.get("reason"), "comparison_context": draft.get("context")})
    legacy = reasons[0] if len(groups) == 1 and reasons else None
    if not groups and entry and "reason" in entry:
        legacy = {"diff_reason": entry.get("reason"), "comparison_context": entry.get("context")}
    return {"draft_diff_reason": legacy.get("diff_reason") if legacy else None,
            "draft_comparison_context": legacy.get("comparison_context") if legacy else None,
            "draft_comparison_reasons": reasons}


def _reason_entries(reasons, allowed):
    entries = {}
    for value in reasons:
        entry = value.model_dump() if hasattr(value, "model_dump") else value
        rule_id = str(entry["rule_id"])
        if rule_id not in allowed or rule_id in entries:
            raise HTTPException(400, "COMPARISON_REASON_INVALID")
        entries[rule_id] = entry
    return entries


def validate_submission(comparison, projected, reason, context, comparison_reasons=None):
    if comparison is None:
        return None
    if "groups" in comparison:
        groups = _grouped(comparison)
        visible = {str(group["rule_id"]): group for group in _grouped(projected) if group.get("active", True)}
        entries = _reason_entries(comparison_reasons or [], set(visible))
        if len(groups) > 1 and reason and comparison_reasons is None:
            raise HTTPException(400, "COMPARISON_REASONS_REQUIRED")
        states = []
        for group in groups:
            rule_id = str(group["rule_id"])
            entry = entries.get(rule_id, {})
            legacy = len(groups) == 1 and comparison_reasons is None
            states.append(validate_submission(group, visible.get(rule_id), reason if legacy else entry.get("diff_reason"),
                context if legacy else entry.get("comparison_context")))
        return _envelope(states)
    if projected is not None and context is not None and context != projected["context"]:
        raise HTTPException(409, "COMPARISON_SOURCE_CHANGED")
    reason = (reason or "").strip()
    if projected is not None and projected["reason_required"] and not reason:
        raise HTTPException(400, "DIFF_REASON_REQUIRED")
    state = {key: deepcopy(value) for key, value in comparison.items() if key != "_contexts"}
    state["reason"] = reason if projected and projected["matches"] and projected["fill_in_diff_reason"] else None
    return state


def merge_submission_state(previous, state):
    saved = _stored_groups(previous)
    for group in _grouped(state):
        saved[str(group["rule_id"])] = deepcopy(group)
    result = deepcopy(state)
    result["groups"] = saved
    drafts = (previous or {}).get("actor_drafts")
    if drafts:
        result["actor_drafts"] = deepcopy(drafts)
    return result


def comparison_prompts(comparison):
    groups = _grouped(comparison)
    if not groups and comparison:
        groups = [comparison]
    return [{**match, "rule_id": group.get("rule_id")} for group in groups
            if group.get("show_notice_in_review") for match in group.get("matches", [])]
