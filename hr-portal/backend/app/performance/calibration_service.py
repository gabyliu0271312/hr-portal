"""Resolve project calibration rules against the cycle snapshot."""
from app.data.employee_roster_contract import normalize_roster_date, organization_path

CALIBRATOR_ROLE_CODE = "assessment.calibrator"


def _matches(groups, value):
    return any(all((value in condition["values"]) == (condition["operator"] == "INCLUDE") for condition in group["conditions"]) for group in groups)


def _matches_scope(employee_no, condition, people, relations):
    field = condition["field"]
    if field == "calibrator_relation":
        matched = bool(relations.intersection(condition["values"]))
        return matched == (condition["operator"] == "INCLUDE")
    person = people[employee_no]
    if field == "employee":
        actual = employee_no
    elif field == "department":
        actual = organization_path(person) or ""
        leaf = actual.rsplit("/", 1)[-1] if actual else ""
        matched = bool(actual and any(actual == value or actual.startswith(f"{value}/") or leaf == value for value in condition["values"]))
        return matched == (condition["operator"] == "INCLUDE")
    else:
        actual = normalize_roster_date(getattr(person, "hire_date", None))
        target = normalize_roster_date(condition["values"][0])
        if actual is None or target is None:
            return False
        return {"before": actual < target, "not_before": actual >= target, "after": actual > target, "not_after": actual <= target}[condition["operator"]]
    matched = actual in condition["values"]
    return matched == (condition["operator"] == "INCLUDE")


def _relations(employee_no, calibrator, people):
    current = people[employee_no].direct_supervisor_employee_no
    visited = {employee_no}
    depth = 1
    while current and current not in visited:
        if current == calibrator:
            return {"ALL_SUBORDINATES", "DIRECT_SUBORDINATES" if depth == 1 else "INDIRECT_SUBORDINATES"}
        visited.add(current)
        manager = people.get(current)
        current = manager.direct_supervisor_employee_no if manager else None
        depth += 1
    return set()


def resolve_calibration(node, settings, people, member_nos, *, require_complete=False):
    config = (settings.get("node_settings", {}).get(node["node_id"], {}).get("calibration") or {})
    phases = config.get("phases") or []
    if require_complete and not phases:
        raise ValueError("请配置校准阶段与校准人")
    result = []
    for index, phase in enumerate(phases):
        phase_id = phase.get("phase_id") or f"phase-{index + 1}"
        assignments = {}
        for rule in phase.get("rules") or []:
            groups = rule.get("subject_groups") or []
            if not groups:
                if require_complete:
                    raise ValueError("请明确指定校准人，不能使用空白校准规则启动项目")
                continue
            references = {value for group in groups for condition in group["conditions"] for value in condition["values"]}
            if references - people.keys():
                raise ValueError("校准人员必须来自本周期人员快照")
            handlers = [employee for employee in people if _matches(groups, employee)]
            for handler in handlers:
                for employee_no in member_nos:
                    in_scope = rule.get("scope", "PROJECT_ALL") == "PROJECT_ALL"
                    if not in_scope:
                        relations = _relations(employee_no, handler, people)
                        in_scope = any(all(_matches_scope(employee_no, condition, people, relations) for condition in group["conditions"]) for group in rule.get("scope_groups") or [])
                    if in_scope:
                        key = (handler, employee_no)
                        assignments[key] = assignments.get(key, False) or bool(rule.get("allow_authorize"))
        result.append({"phase_id": phase_id, "assignments": [{"handler_ref": handler, "employee_no": employee, "allow_authorize": authorize} for (handler, employee), authorize in sorted(assignments.items())]})
    assigned = {item["employee_no"] for phase in result for item in phase["assignments"]}
    return {"role_code": CALIBRATOR_ROLE_CODE, "evaluated_count": len(member_nos), "assigned_count": len(assigned), "unassigned_count": len(set(member_nos) - assigned), "phases": result}


def calibration_task_scope(task, node):
    calibration = (node.config or {}).get("calibration") or {}
    if task.project_id != node.project_id or node.node_type != "calibration" or task.task_kind != "calibration" or calibration.get("role_code") != CALIBRATOR_ROLE_CODE:
        return False
    return any(phase["phase_id"] == task.phase_id and any(item["handler_ref"] == task.handler_ref and item["employee_no"] == task.target_employee_no for item in phase["assignments"]) for phase in calibration.get("phases") or [])


def calibration_template(node, final_node, content_library):
    from copy import deepcopy
    from app.performance.self_summary_service import resolve_self_summary_content

    result = deepcopy(node)
    source = resolve_self_summary_content(final_node, content_library)
    contents = []
    overrides = node.get("calibration_settings") or {}
    for raw in source.get("content") or []:
        if (raw.get("content_slot") or "fill") != "fill" or raw.get("type") == "reference":
            continue
        content = deepcopy(raw)
        content_id = str(content.get("content_id") or content.get("id") or f"{content.get('type')}-{content.get('name')}")
        override = overrides.get(content_id) or {}
        content["settings"] = {**(content.get("settings") or {}), **(override.get("settings") or {})}
        for item in content.get("items") or []:
            config = (override.get("items") or {}).get(str(item.get("id"))) or {}
            item["settings"] = {**(item.get("settings") or {}), **config}
            if config.get("allowModify") is False and item["settings"].get("mode") != "hidden":
                item["settings"]["mode"] = "view"
        content["content_slot"] = "fill"
        contents.append(content)
    result["content"] = contents + [item for item in result.get("content") or [] if item.get("content_slot") == "reference"]
    return result
