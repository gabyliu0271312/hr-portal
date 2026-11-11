"""Resolve project calibration rules against the cycle snapshot."""
from copy import deepcopy
from datetime import UTC, datetime
import hashlib
import json

from app.data.employee_roster_contract import normalize_roster_date, organization_path

CALIBRATOR_ROLE_CODE = "assessment.calibrator"


class CalibrationConflict(ValueError):
    def __init__(self, code, message):
        super().__init__(message)
        self.code = code


def calibration_phase_window(flow, node, phase_id):
    timing = ((flow or {}).get("node_times") or {}).get(node.node_id) or {}
    if "phase_times" in timing:
        return (timing.get("phase_times") or {}).get(phase_id)
    snapshot_timing = (node.config or {}).get("time") or {}
    return (snapshot_timing.get("phase_times") or {}).get(phase_id)


_DISTRIBUTION_OPERATOR_LABELS = {"EQ": "等于", "LT": "小于", "LTE": "小于等于", "GT": "大于", "GTE": "大于等于"}
_DISTRIBUTION_CONTROL_LABELS = {"HARD": "强制", "SOFT": "建议"}
_DISTRIBUTION_ROUNDING_LABELS = {"ROUND": "四舍五入", "CEIL": "向上取整", "FLOOR": "向下取整", "NONE": "不强制取整"}


def _distribution_rule_lines(rule, assessment_names=None) -> list[str]:
    """将一条分布规则转成可读点列表（供前端 tooltip 渲染）。"""
    names = assessment_names or {}
    item_name = names.get(rule.get("assessment_item_id")) or rule.get("assessment_item_id") or "未命名评估项"
    min_op = _DISTRIBUTION_OPERATOR_LABELS.get(rule.get("min_people_operator", "GTE"), rule.get("min_people_operator", ""))
    lines = [f"{item_name}：适用人数{min_op}{rule.get('min_people_count', 0)}人时生效"]
    for condition in rule.get("conditions") or []:
        codes = "、".join(condition.get("grade_codes") or [])
        operator = _DISTRIBUTION_OPERATOR_LABELS.get(condition.get("operator"), condition.get("operator", ""))
        unit = "%" if condition.get("unit") == "PERCENT" else "人"
        mode = _DISTRIBUTION_CONTROL_LABELS.get(condition.get("control_mode"), condition.get("control_mode", ""))
        lines.append(f"{mode}：{codes} {operator} {condition.get('value')}{unit}")
    rounding = _DISTRIBUTION_ROUNDING_LABELS.get(rule.get("rounding_method"), rule.get("rounding_method", ""))
    lines.append(f"取整方式：{rounding}")
    return lines


def distribution_summary(flow, node, phase_id, assessment_names=None) -> dict:
    """解析校准任务所属阶段当前生效的绩效结果分布规则（节点级 distribution + phase 级 distribution_rules 覆盖）。"""
    calibration = (((flow or {}).get("node_settings") or {}).get(node.node_id) or {}).get("calibration") or {}
    enabled = bool(calibration.get("force_distribution_enabled"))
    distribution = calibration.get("distribution") or {}
    rules = list(distribution.get("rules") or [])
    for phase in calibration.get("phases") or []:
        if phase.get("phase_id") != phase_id:
            continue
        for rule in phase.get("rules") or []:
            phase_rules = rule.get("distribution_rules")
            if phase_rules:
                rules = list(phase_rules)
                break
        break
    return {
        "force_distribution_enabled": enabled,
        "mode": distribution.get("mode", "UNIFIED"),
        "rules": rules,
        "lines": [line for rule in rules for line in _distribution_rule_lines(rule, assessment_names)],
    }


def canonical_flow(flow, project_id):
    result = deepcopy(flow or {})
    for node_id, setting in (result.get("node_settings") or {}).items():
        calibration = setting.get("calibration")
        if calibration is None:
            continue
        calibration.setdefault("force_distribution_enabled", False)
        calibration.setdefault("distribution", {"mode": "UNIFIED", "rules": [], "scope_configured": False})
        for phase_index, phase in enumerate(calibration.get("phases") or []):
            phase_id = phase.setdefault("phase_id", f"phase-{phase_index + 1}")
            for rule_index, rule in enumerate(phase.get("rules") or []):
                rule.setdefault("subject_type", "PERSON")
                rule.setdefault("operator", "INCLUDE")
                rule.setdefault("scope", "PROJECT_ALL")
                rule.setdefault("allow_authorize", False)
                identity = f"{project_id}:{node_id}:{phase_id}:{rule_index}"
                rule.setdefault("rule_id", "rule-" + hashlib.sha256(identity.encode()).hexdigest()[:24])
        phases = calibration.get("phases") or []
        phase_ids = [phase["phase_id"] for phase in phases]
        if len(phase_ids) != len(set(phase_ids)):
            raise CalibrationConflict("CALIBRATION_PHASE_ID_CONFLICT", "校准阶段标识重复")
        rule_ids = [rule["rule_id"] for phase in phases for rule in phase.get("rules") or []]
        if len(rule_ids) != len(set(rule_ids)):
            raise CalibrationConflict("CALIBRATION_RULE_ID_CONFLICT", "校准规则标识重复")
    return result


def calibration_digest(flow, project_id):
    normalized = canonical_flow(flow, project_id)
    settings = {key: value["calibration"] for key, value in (normalized.get("node_settings") or {}).items() if "calibration" in value}
    timing = {key: (normalized.get("node_times") or {}).get(key, {}) for key in settings}
    return hashlib.sha256(json.dumps([settings, timing], sort_keys=True, separators=(",", ":"), default=str).encode()).hexdigest()


def editing_policy(project, flow, now=None):
    from app.performance.project_service import _parse_time
    now = now or datetime.now(UTC)
    started = project.status == "STARTED"
    nodes = {}
    for node_id, setting in (flow.get("node_settings") or {}).items():
        if "calibration" not in setting:
            continue
        timing = (flow.get("node_times") or {}).get(node_id) or {}
        phases = {}
        distribution_allowed = True
        for phase in setting["calibration"].get("phases") or []:
            window = (timing.get("phase_times") or {}).get(phase["phase_id"], timing)
            start, end = _parse_time(window.get("start_at")), _parse_time(window.get("end_at"))
            if started and (start is None or now >= start):
                distribution_allowed = False
            can_delete = not started or end is not None and now < end
            phases[phase["phase_id"]] = {"can_delete": can_delete, "delete_disabled_reason": None if can_delete else "校准阶段已截止或缺少时间，请先单独延期保存"}
        nodes[node_id] = {"can_edit_distribution": distribution_allowed, "distribution_disabled_reason": None if distribution_allowed else "全部既有校准阶段未开始时才可修改分布", "can_edit_rule_content": not started, "can_edit_phase_content": not started, "phases": phases}
    all_distribution_allowed = all(node["can_edit_distribution"] for node in nodes.values())
    if not all_distribution_allowed:
        for node in nodes.values():
            node["can_edit_distribution"] = False
            node["distribution_disabled_reason"] = "全部既有校准阶段未开始时才可修改分布"
    return {"server_now": now.isoformat(), "calibration_nodes": nodes, "can_edit_result_opening": True}


def validate_calibration_change(project, old_flow, new_flow, operations, base_digest, now=None):
    now = now or datetime.now(UTC)
    old = canonical_flow(old_flow, project.id)
    new = canonical_flow(new_flow, project.id)
    if base_digest is not None and base_digest != calibration_digest(old, project.id):
        raise CalibrationConflict("CALIBRATION_BASE_CONFLICT", "校准配置已变更，请刷新后重试")
    policy = editing_policy(project, old, now)["calibration_nodes"]
    expected = set()
    old_nodes, new_nodes = old.get("node_settings") or {}, new.get("node_settings") or {}
    for node_id in old_nodes.keys() | new_nodes.keys():
        before = old_nodes.get(node_id, {}).get("calibration") or {"phases": []}
        after = new_nodes.get(node_id, {}).get("calibration") or {"phases": []}
        if project.status != "STARTED":
            continue
        a = {p["phase_id"]: p for p in before.get("phases") or []}
        b = {p["phase_id"]: p for p in after.get("phases") or []}
        if [p["phase_id"] for p in before.get("phases") or [] if p["phase_id"] in b] != [p["phase_id"] for p in after.get("phases") or [] if p["phase_id"] in a]:
            raise CalibrationConflict("CALIBRATION_CONTENT_LOCKED", "已有校准阶段顺序不可修改")
        if {k: v for k, v in before.items() if k not in {"phases", "distribution", "force_distribution_enabled"}} != {k: v for k, v in after.items() if k not in {"phases", "distribution", "force_distribution_enabled"}}:
            raise CalibrationConflict("CALIBRATION_CONTENT_LOCKED", "已有校准设置内容不可修改")
        distribution_changed = any(before.get(k) != after.get(k) for k in ("force_distribution_enabled", "distribution"))
        for phase_id in a.keys() | b.keys():
            if phase_id not in a:
                expected.add(("add_phase", node_id, phase_id, None))
                continue
            removed = phase_id not in b
            ar = {r["rule_id"]: r for r in a[phase_id].get("rules") or []}
            br = {r["rule_id"]: r for r in b.get(phase_id, {}).get("rules") or []}
            if len(ar) != len(a[phase_id].get("rules") or []) or len(br) != len(b.get(phase_id, {}).get("rules") or []):
                raise CalibrationConflict("CALIBRATION_RULE_ID_CONFLICT", "校准规则标识重复")
            if removed or ar.keys() - br.keys():
                if not policy.get(node_id, {}).get("phases", {}).get(phase_id, {}).get("can_delete"):
                    raise CalibrationConflict("CALIBRATION_PHASE_CLOSED", "校准阶段已截止，请先单独延期保存")
            if removed:
                expected.add(("delete_phase", node_id, phase_id, None))
                continue
            if {k: v for k, v in a[phase_id].items() if k != "rules"} != {k: v for k, v in b[phase_id].items() if k != "rules"}:
                raise CalibrationConflict("CALIBRATION_CONTENT_LOCKED", "已有校准阶段内容不可编辑")
            if [r["rule_id"] for r in a[phase_id].get("rules") or [] if r["rule_id"] in br] != [r["rule_id"] for r in b[phase_id].get("rules") or [] if r["rule_id"] in ar]:
                raise CalibrationConflict("CALIBRATION_CONTENT_LOCKED", "已有校准规则顺序不可编辑")
            for rule_id in ar.keys() | br.keys():
                if rule_id not in ar:
                    expected.add(("add_rule", node_id, phase_id, rule_id))
                elif rule_id not in br:
                    expected.add(("delete_rule", node_id, phase_id, rule_id))
                else:
                    if {k: v for k, v in ar[rule_id].items() if k != "distribution_rules"} != {k: v for k, v in br[rule_id].items() if k != "distribution_rules"}:
                        raise CalibrationConflict("CALIBRATION_CONTENT_LOCKED", "已启动校准规则内容不可编辑")
                    distribution_changed |= ar[rule_id].get("distribution_rules", []) != br[rule_id].get("distribution_rules", [])
        if distribution_changed and not policy.get(node_id, {}).get("can_edit_distribution", True):
            raise CalibrationConflict("CALIBRATION_DISTRIBUTION_STARTED", "全部既有阶段未开始时才可修改分布")
    actual = [(op["operation"], op["node_id"], op["phase_id"], op.get("rule_id")) for op in operations]
    if project.status == "STARTED" and (set(actual) != expected or len(actual) != len(set(actual))):
        raise CalibrationConflict("CALIBRATION_OPERATIONS_MISMATCH", "校准增删必须与显式操作一致，不能隐式替换")
    return old, new, bool(expected)


async def apply_calibration_delta(db, project, old_flow, new_flow, *, actor_type, actor_id):
    from sqlalchemy import select
    from app.performance.models import PerformanceProjectNodeSnapshot, PerformanceProjectMemberSnapshot, PerformanceProjectMember, PerformanceAuthorizationSnapshotPerson, PerformanceNodeTask, PerformanceNodeTaskAuthorization
    from app.performance.authorization_service import AuditEventInput, PerformanceAuditService
    from app.performance.project_service import _parse_time
    nodes = list((await db.execute(select(PerformanceProjectNodeSnapshot).where(PerformanceProjectNodeSnapshot.project_id == project.id, PerformanceProjectNodeSnapshot.node_type == "calibration").order_by(PerformanceProjectNodeSnapshot.id).with_for_update().execution_options(populate_existing=True))).scalars().all())
    snapshot = await db.scalar(select(PerformanceProjectMemberSnapshot).where(PerformanceProjectMemberSnapshot.project_id == project.id).order_by(PerformanceProjectMemberSnapshot.id.desc()))
    if snapshot is None:
        raise CalibrationConflict("CALIBRATION_HISTORY_CONFLICT", "项目成员快照不存在")
    members = list((await db.execute(select(PerformanceProjectMember).where(PerformanceProjectMember.snapshot_id == snapshot.id))).scalars().all())
    people = list((await db.execute(select(PerformanceAuthorizationSnapshotPerson).where(PerformanceAuthorizationSnapshotPerson.snapshot_id == snapshot.source_snapshot_id))).scalars().all())
    people_map = {p.employee_no: p for p in people}
    people_map.update({p.employee_no: p for p in members})
    tasks = list((await db.execute(select(PerformanceNodeTask).where(PerformanceNodeTask.project_id == project.id, PerformanceNodeTask.task_kind == "calibration", PerformanceNodeTask.revoked_at.is_(None)).order_by(PerformanceNodeTask.id).with_for_update())).scalars().all())
    task_member_nos = (snapshot.source_filter or {}).get("task_generation_employee_nos")
    if task_member_nos is None:
        task_member_nos = sorted(set((await db.execute(select(PerformanceNodeTask.target_employee_no).where(PerformanceNodeTask.project_id == project.id, PerformanceNodeTask.member_snapshot_id == snapshot.id))).scalars().all()))
        if len(task_member_nos) != int(project.evaluated_count):
            raise CalibrationConflict("CALIBRATION_HISTORY_CONFLICT", "历史任务生成成员范围无法证明一致")
    if set(task_member_nos) - {m.employee_no for m in members}:
        raise CalibrationConflict("CALIBRATION_HISTORY_CONFLICT", "历史任务生成成员范围与快照不一致")
    now = datetime.now(UTC)
    outcome = {"added_tasks": 0, "revoked_tasks": 0, "notification_results": []}
    notify = set()
    node_map = {n.node_id: n for n in nodes}
    for node_id, setting in (new_flow.get("node_settings") or {}).items():
        if "calibration" in setting and node_id not in node_map:
            raise CalibrationConflict("CALIBRATION_HISTORY_CONFLICT", "校准节点冻结快照不存在")
    for node in nodes:
        before = ((old_flow.get("node_settings") or {}).get(node.node_id) or {}).get("calibration") or {"phases": []}
        after = ((new_flow.get("node_settings") or {}).get(node.node_id) or {}).get("calibration") or {"phases": []}
        if before == after:
            continue
        frozen = (node.config or {}).get("calibration") or {}
        frozen_phases = {p["phase_id"]: p for p in frozen.get("phases") or []}
        old_phases = {p["phase_id"]: p for p in before.get("phases") or []}
        node_tasks = [t for t in tasks if t.node_snapshot_id == node.id]
        expected_tuples = {(p["phase_id"], a["handler_ref"], a["employee_no"]) for p in frozen_phases.values() for a in p.get("assignments") or []}
        if expected_tuples != {(t.phase_id, t.handler_ref, t.target_employee_no) for t in node_tasks} or any(t.member_snapshot_id != snapshot.id for t in node_tasks):
            raise CalibrationConflict("CALIBRATION_HISTORY_CONFLICT", "历史校准任务与冻结来源不一致")
        source_by_phase = {}
        for phase_id, phase in old_phases.items():
            frozen_phase = frozen_phases.get(phase_id, {})
            sources = frozen_phase.get("rule_sources")
            if sources is None or len(sources) != len(phase.get("rules") or []):
                recovered = resolve_calibration({"node_id": node.node_id}, {"node_settings": {node.node_id: {"calibration": {"phases": [phase]}}}}, people_map, task_member_nos)
                sources = recovered["phases"][0]["rule_sources"]
                if len(sources) != len(phase.get("rules") or []):
                    raise CalibrationConflict("CALIBRATION_HISTORY_CONFLICT", "历史校准规则来源无法恢复")
            by_rule = {}
            for rule, source in zip(phase.get("rules") or [], sources):
                source_rule = canonical_flow({"node_settings": {node.node_id: {"calibration": {"phases": [{"phase_id": phase_id, "rules": [source.get("rule") or {}]}]}}}}, project.id)["node_settings"][node.node_id]["calibration"]["phases"][0]["rules"][0]
                if {k: v for k, v in rule.items() if k not in {"rule_id", "distribution_rules"}} != {k: v for k, v in source_rule.items() if k not in {"rule_id", "distribution_rules"}}:
                    raise CalibrationConflict("CALIBRATION_HISTORY_CONFLICT", "历史校准规则与冻结来源不一致")
                by_rule[rule["rule_id"]] = {**deepcopy(source), "rule_id": rule["rule_id"], "rule": deepcopy(rule)}
            aggregate = aggregate_sources(list(by_rule.values()))
            if {(a["handler_ref"], a["employee_no"], a["allow_authorize"]) for a in aggregate} != {(a["handler_ref"], a["employee_no"], bool(a.get("allow_authorize"))) for a in frozen_phase.get("assignments") or []}:
                raise CalibrationConflict("CALIBRATION_HISTORY_CONFLICT", "历史校准分配与冻结来源不一致")
            source_by_phase[phase_id] = by_rule
        phases = []
        timing = (new_flow.get("node_times") or {}).get(node.node_id) or {}
        for phase in after.get("phases") or []:
            phase_id = phase["phase_id"]
            window = (timing.get("phase_times") or {}).get(phase_id) or {}
            if not window.get("start_at") or not window.get("end_at"):
                raise CalibrationConflict("CALIBRATION_PHASE_TIME_REQUIRED", "新增或保留阶段须有完整开始和截止时间")
            sources = []
            for rule in phase.get("rules") or []:
                source = source_by_phase.get(phase_id, {}).get(rule["rule_id"])
                if source is None:
                    delta_flow = {"node_settings": {node.node_id: {"calibration": {"phases": [{"phase_id": phase_id, "rules": [rule]}]}}}}
                    try:
                        resolved = resolve_calibration({"node_id": node.node_id}, delta_flow, people_map, task_member_nos, require_complete=True)
                    except ValueError as exc:
                        raise CalibrationConflict("CALIBRATION_RULE_INVALID", str(exc)) from exc
                    source = resolved["phases"][0]["rule_sources"][0]
                source = {**source, "rule": deepcopy(rule)}
                sources.append(source)
            phases.append({"phase_id": phase_id, "rule_sources": sources, "assignments": aggregate_sources(sources)})
        assignments = {(p["phase_id"], a["handler_ref"], a["employee_no"]): a for p in phases for a in p["assignments"]}
        existing = {(t.phase_id, t.handler_ref, t.target_employee_no): t for t in node_tasks}
        for key, task in existing.items():
            assignment = assignments.get(key)
            if assignment is None:
                task.revoked_at = now
                outcome["revoked_tasks"] += 1
                notify.add(task.handler_ref)
                PerformanceAuditService(db).append_event(AuditEventInput(event_type="CALIBRATION_TASK_REVOKED", cycle_ref=project.cycle_ref, actor_type=actor_type, actor_ref=str(actor_id), employee_no=task.target_employee_no, subject_type="PERFORMANCE_NODE_TASK", subject_ref=str(task.id), after_state={"reason": "calibration_source_removed", "project_id": project.id, "revoked_at": now.isoformat()}))
            if assignment is None or not assignment["allow_authorize"]:
                records = list((await db.execute(select(PerformanceNodeTaskAuthorization).where(PerformanceNodeTaskAuthorization.task_id == task.id, PerformanceNodeTaskAuthorization.status == "ACTIVE").with_for_update())).scalars().all())
                for record in records:
                    record.status = "REVOKED"
                    record.revoked_at = now
                    record.revoked_by_employee_no = str(actor_id)
        for key in assignments.keys() - existing.keys():
            phase_id, handler, employee_no = key
            window = timing["phase_times"][phase_id]
            db.add(PerformanceNodeTask(project_id=project.id, cycle_ref=project.cycle_ref, member_snapshot_id=snapshot.id, node_snapshot_id=node.id, target_employee_no=employee_no, handler_ref=handler, task_kind="calibration", phase_id=phase_id, status="pending", available_at=_parse_time(window["start_at"]), due_at=_parse_time(window["end_at"])))
            outcome["added_tasks"] += 1
        assigned = {a["employee_no"] for p in phases for a in p["assignments"]}
        node.config = {**(node.config or {}), "calibration": {**frozen, "phases": phases, "assigned_count": len(assigned), "unassigned_count": len(members) - len(assigned)}, "time": timing}
    await db.flush()
    return outcome, notify


async def notify_revoked_calibrators(db, project, handlers):
    from sqlalchemy import select
    from app.users.models import User
    from app.performance.models import PerformanceIdentityLink
    from app.integrations.feishu.notification_service import send_notification
    from app.integrations.feishu.schemas import FixedUsersRule, MessageConfig, NotificationConfig
    results = []
    for handler in sorted(handlers):
        try:
            user = await db.scalar(select(User).join(PerformanceIdentityLink, PerformanceIdentityLink.portal_user_id == User.id).where(PerformanceIdentityLink.employee_no == handler, PerformanceIdentityLink.is_active.is_(True), User.is_active.is_(True)))
            if user is None or not user.feishu_user_id:
                results.append({"employee_no": handler, "status": "recipient_unmapped"})
                continue
            result = await send_notification(NotificationConfig(receivers=[FixedUsersRule(type="fixed_users", user_ids=[user.id])], message=MessageConfig(title_template="校准任务已删除", content_template="绩效项目“{{project_name}}”中你的部分校准任务已删除，请查看最新任务。")), {"project_name": project.name}, db, biz_type="performance_calibration_revoked", biz_id=f"{project.id}:{handler}:{datetime.now(UTC).isoformat()}")
            await db.commit()
            results.append({"employee_no": handler, "status": result.status, "errors": result.errors})
        except Exception:
            await db.rollback()
            results.append({"employee_no": handler, "status": "failed"})
    return results


def aggregate_sources(sources):
    assignments = {}
    for source in sources:
        for item in source.get("assignments") or []:
            key = item["handler_ref"], item["employee_no"]
            assignment = assignments.setdefault(key, {"handler_ref": key[0], "employee_no": key[1], "allow_authorize": False, "source_rule_ids": []})
            assignment["allow_authorize"] |= bool(item.get("allow_authorize"))
            assignment["source_rule_ids"].append(source["rule_id"])
    return [assignments[key] for key in sorted(assignments)]


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
        if require_complete and not phase.get("rules"):
            raise ValueError("请配置校准规则")
        phase_id = phase.get("phase_id") or f"phase-{index + 1}"
        assignments = {}
        sources = []
        for rule_index, rule in enumerate(phase.get("rules") or []):
            rule_id = rule.get("rule_id") or f"rule-{index + 1}-{rule_index + 1}"
            rule_assignments = []
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
                        assignment = assignments.setdefault(key, {"handler_ref": handler, "employee_no": employee_no, "allow_authorize": False, "source_rule_ids": []})
                        assignment["allow_authorize"] |= bool(rule.get("allow_authorize"))
                        assignment["source_rule_ids"].append(rule_id)
                        rule_assignments.append({"handler_ref": handler, "employee_no": employee_no, "allow_authorize": bool(rule.get("allow_authorize"))})
            sources.append({"rule_id": rule_id, "rule": deepcopy(rule), "assignments": rule_assignments})
        result.append({"phase_id": phase_id, "rule_sources": sources, "assignments": [assignments[key] for key in sorted(assignments)]})
    assigned = {item["employee_no"] for phase in result for item in phase["assignments"]}
    return {"role_code": CALIBRATOR_ROLE_CODE, "evaluated_count": len(member_nos), "assigned_count": len(assigned), "unassigned_count": len(set(member_nos) - assigned), "phases": result}


def extend_calibration_member(node, flow, people, old_member_nos, employee_no):
    frozen = deepcopy((node.config or {}).get("calibration") or {})
    configured = ((flow.get("node_settings") or {}).get(node.node_id) or {}).get("calibration") or {}
    configured_phases = {phase["phase_id"]: phase for phase in configured.get("phases") or []}
    phases = frozen.get("phases") or []
    if not phases or set(configured_phases) != {phase["phase_id"] for phase in phases}:
        raise CalibrationConflict("CALIBRATION_HISTORY_CONFLICT", "校准阶段与冻结来源不一致")
    delta_phases = []
    for phase in phases:
        sources = phase.get("rule_sources")
        rules = configured_phases[phase["phase_id"]].get("rules") or []
        if sources is None:
            recovered = resolve_calibration({"node_id": node.node_id}, {"node_settings": {node.node_id: {"calibration": {"phases": [configured_phases[phase["phase_id"]]]}}}}, people, old_member_nos)
            sources = recovered["phases"][0]["rule_sources"]
        if [source["rule_id"] for source in sources] != [rule["rule_id"] for rule in rules]:
            raise CalibrationConflict("CALIBRATION_HISTORY_CONFLICT", "校准规则与冻结来源不一致")
        expected = {(item["handler_ref"], item["employee_no"], bool(item.get("allow_authorize"))) for item in aggregate_sources(sources)}
        actual = {(item["handler_ref"], item["employee_no"], bool(item.get("allow_authorize"))) for item in phase.get("assignments") or []}
        if expected != actual:
            raise CalibrationConflict("CALIBRATION_HISTORY_CONFLICT", "校准分配与冻结来源不一致")
        delta_flow = {"node_settings": {node.node_id: {"calibration": {"phases": [{"phase_id": phase["phase_id"], "rules": [source["rule"] for source in sources]}]}}}}
        delta = resolve_calibration({"node_id": node.node_id}, delta_flow, people, [employee_no], require_complete=True)["phases"][0]
        for source, added in zip(sources, delta["rule_sources"]):
            source["assignments"].extend(added["assignments"])
        phase["rule_sources"] = sources
        phase["assignments"] = aggregate_sources(sources)
        delta_phases.append(delta)
    member_nos = set(old_member_nos) | {employee_no}
    assigned = {item["employee_no"] for phase in phases for item in phase["assignments"]}
    frozen.update({"phases": phases, "evaluated_count": len(member_nos), "assigned_count": len(assigned), "unassigned_count": len(member_nos - assigned)})
    return frozen, delta_phases


def calibration_task_scope(task, node):
    calibration = (node.config or {}).get("calibration") or {}
    if getattr(task, "revoked_at", None) is not None or task.project_id != node.project_id or node.node_type != "calibration" or task.task_kind != "calibration" or calibration.get("role_code") != CALIBRATOR_ROLE_CODE:
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
