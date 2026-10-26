from types import SimpleNamespace

from sqlalchemy import and_, func, select, true

from app.datasets.authorization_contract import (
    ProductAuthorizationDefinition, _snapshot_drift, _validate_relation_cardinality_constraints,
    _validate_relation_metadata, derived_summary_fields,
)
from app.datasets.d_execution import (
    SExecutionBindingIn, _as_contract, compile_allocation_fact_s_select_for_user,
)
from app.warehouse.schemas import ExecutionPlanIn


def _issue(code, message):
    return [{"code": code, "message": message}]


def validate_multifact_shape(definition, snapshot):
    if (not isinstance(snapshot, dict)
            or any(not isinstance(snapshot.get(key), list)
                   or any(not isinstance(item, dict) for item in snapshot[key])
                   for key in ("tables", "relations", "outputs"))):
        return _issue("authorization_snapshot_invalid", "多事实结构快照无效")
    tables = snapshot.get("tables", [])
    relations = snapshot.get("relations", [])
    outputs = snapshot.get("outputs", [])
    aliases = {fact.alias: fact.table_name for fact in definition.facts}
    if (definition.schema_version != 3 or len(definition.facts) != 2 or len(set(aliases.values())) != 2 or len(tables) != 2
            or len(relations) != 1 or {item.get("alias"): item.get("table_name") for item in tables} != aliases):
        return _issue("multi_fact_shape_unsupported", "当前多事实切片要求schema3、两个事实及一条已批准关联")
    if any(fact.role not in {"person_fact", "allocation_fact"} or not fact.employee_key
           or (fact.role == "person_fact" and (fact.cost_center_key or fact.allow_cost_center_summary))
           or (fact.role == "allocation_fact" and not fact.allow_cost_center_summary)
           for fact in definition.facts):
        return _issue("multi_fact_path_unsupported", "各事实必须声明独立人员路径，中心资格仅供获准分摊事实")
    relation = SimpleNamespace(**relations[0])
    issues = _validate_relation_metadata([relation], set(aliases))
    if issues:
        return issues
    if relation.join_type not in {"left", "inner"}:
        return _issue("multi_fact_join_unsupported", "当前切片只开放显式LEFT或INNER关联，其他保留侧尚未批准")
    if any(item.get("source_alias") not in aliases for item in outputs):
        return _issue("multi_fact_output_invalid", "所有输出必须归属已批准事实")
    return []


def validate_multifact_plan(definition, snapshot, plan):
    issues = validate_multifact_shape(definition, snapshot)
    if issues:
        return issues
    outputs = {item["output_code"]: item for item in snapshot["outputs"]}
    derived = derived_summary_fields(definition, snapshot["outputs"])
    refs = set(plan.output_fields) | set(plan.group_by) | set(plan.aggregations) | {item.field for item in plan.conditions}
    if (len(outputs) != len(snapshot["outputs"]) or not refs <= set(outputs)
            or len(plan.output_fields) != len(set(plan.output_fields))
            or set(plan.output_fields) != set(plan.group_by) | set(plan.aggregations)
            or not plan.aggregations or set(plan.group_by) & set(plan.aggregations)
            or plan.filters or plan.order_by or plan.personal_fields or plan.employee_keys):
        return _issue("multi_fact_plan_unsupported", "多事实仅支持明确的非个人维度与已批准度量汇总")
    if (not set(plan.group_by) <= set(derived["dimensions"])
            or not {item.field for item in plan.conditions} <= set(derived["dimensions"])
            or not set(plan.aggregations) <= set(derived["measures"])
            or any(value not in {"sum", "count", "min", "max", "avg"} for value in plan.aggregations.values())):
        return _issue("multi_fact_field_unsupported", "个人定位、未批准维度或聚合函数不能用于多事实汇总")
    if {outputs[code]["source_alias"] for code in plan.aggregations} != {fact.alias for fact in definition.facts}:
        return _issue("multi_fact_measure_required", "当前切片要求两个事实各有至少一个受控度量")
    relation = snapshot["relations"][0]
    for metric in plan.aggregations:
        owner = outputs[metric]["source_alias"]
        for dimension in plan.group_by:
            dimension_owner = outputs[dimension]["source_alias"]
            if dimension_owner == owner:
                continue
            unique = (relation["cardinality"] == "1:1"
                      or (owner == relation["left_alias"] and relation["cardinality"] == "N:1")
                      or (owner == relation["right_alias"] and relation["cardinality"] == "1:N"))
            if not unique:
                return _issue("multi_fact_measure_split_unapproved", "维度会把另一事实拆到多个组，必须先批准拆分口径")
    return []


async def compile_multifact_summary(*, contract, request, user, db):
    contract = _as_contract(contract)
    if (contract.status != "active" or contract.runtime_enabled
            or request.dataset_id != contract.dataset_id or request.contract_id != contract.contract_id
            or request.contract_version != contract.contract_version):
        return None, _issue("authorization_contract_invalid", "多事实计划未绑定当前服务端合同")
    definition, snapshot, plan = contract.definition, contract.model_snapshot, request.plan
    issues = validate_multifact_plan(definition, snapshot, plan)
    if issues:
        return None, issues
    from app.datasets.models import DataSetTable, DataSetRelation, DatasetOutputField
    tables = (await db.execute(select(DataSetTable).where(DataSetTable.dataset_id == contract.dataset_id))).scalars().all()
    relations = (await db.execute(select(DataSetRelation).where(DataSetRelation.dataset_id == contract.dataset_id))).scalars().all()
    current_outputs = (await db.execute(select(DatasetOutputField).where(DatasetOutputField.dataset_id == contract.dataset_id))).scalars().all()
    if _snapshot_drift(snapshot, tables, relations, current_outputs):
        return None, _issue("authorization_contract_drift", "多事实来源、关系或输出已偏离批准快照")
    from app.datasets.authorization_contract import _collect_contract_physical_drift
    issues = await _collect_contract_physical_drift(db, definition, tables, relations, current_outputs)
    if issues:
        return None, issues
    issues = await _validate_relation_cardinality_constraints(db, tables, relations)
    if issues:
        return None, issues
    outputs = {item["output_code"]: item for item in snapshot["outputs"]}
    relation = snapshot["relations"][0]
    sources = {}
    for fact in definition.facts:
        own_outputs = [item for item in snapshot["outputs"] if item["source_alias"] == fact.alias]
        own_codes = {item["output_code"] for item in own_outputs}
        keys = {fact.fact_key}
        side = "left" if fact.alias == relation["left_alias"] else "right"
        keys.update(item[side] for item in relation["keys"])
        anchors = {fact.fact_key, fact.employee_key, fact.cost_center_key} - {None}
        dependency_codes = set()
        for key in keys - anchors:
            candidates = [item for item in own_outputs if item["source_column"] == key and item.get("agg_role") != "measure"]
            if len(candidates) != 1:
                return None, _issue("multi_fact_join_dependency_unverified", "关联依赖缺少唯一的受控维度输出")
            dependency_codes.add(candidates[0]["output_code"])
        metric_codes = set(plan.aggregations) & own_codes
        group_codes = (set(plan.group_by) & own_codes) | dependency_codes | {item.field for item in plan.conditions if item.field in own_codes}
        single_definition = ProductAuthorizationDefinition(schema_version=3, facts=[fact])
        single_snapshot = {"tables": [item for item in snapshot["tables"] if item["alias"] == fact.alias],
                           "relations": [], "outputs": own_outputs}
        single_contract = {"id": contract.contract_id, "dataset_id": contract.dataset_id,
                           "contract_version": contract.contract_version, "status": "active",
                           "contract_json": single_definition.model_dump(), "model_snapshot": single_snapshot}
        single_request = SExecutionBindingIn(dataset_id=request.dataset_id, contract_id=request.contract_id,
            contract_version=request.contract_version, plan=ExecutionPlanIn(
                output_fields=sorted(group_codes | metric_codes), group_by=sorted(group_codes),
                aggregations={code: plan.aggregations[code] for code in metric_codes}))
        statement, issues = await compile_allocation_fact_s_select_for_user(
            contract=single_contract, request=single_request, user=user, db=db, _row_keys=keys)
        if issues:
            return None, issues
        sources[fact.alias] = statement.cte(f"controlled_{fact.alias}")
    left, right = sources[relation["left_alias"]], sources[relation["right_alias"]]
    from app.datasets.d_execution import _physical_type_name_from_model
    if any(_physical_type_name_from_model(left.c[item["left"]]) != _physical_type_name_from_model(right.c[item["right"]])
           for item in relation["keys"]):
        return None, _issue("multi_fact_join_type_mismatch", "关联两侧的物理键类型不兼容")
    predicates = [left.c[item["left"]] == right.c[item["right"]] for item in relation["keys"]]
    joined = left.join(right, and_(*predicates), isouter=relation["join_type"] == "left")

    def expression(code):
        output = outputs[code]
        return sources[output["source_alias"]].c[output["source_column"]]

    clauses = []
    for condition in plan.conditions:
        column = expression(condition.field)
        if condition.operator == "eq" and not isinstance(condition.value, (list, dict)):
            clauses.append(column == condition.value)
        elif condition.operator == "in" and isinstance(condition.value, list) and 0 < len(condition.value) <= 200:
            clauses.append(column.in_(condition.value))
        elif condition.operator == "between" and isinstance(condition.value, list) and len(condition.value) == 2:
            clauses.append(column.between(*condition.value))
        elif condition.operator in {"gte", "lte"} and not isinstance(condition.value, (list, dict)):
            clauses.append(column >= condition.value if condition.operator == "gte" else column <= condition.value)
        else:
            return None, _issue("multi_fact_filter_invalid", "筛选操作符或值未通过受控校验")
    dimensions = [expression(code).label(code) for code in plan.group_by]
    groups = select(*dimensions).select_from(joined).where(*clauses).distinct().cte("authorized_groups") if dimensions else None
    result_from = groups
    selected = {code: groups.c[code] for code in plan.group_by} if groups is not None else {}
    for index, (code, aggregation) in enumerate(plan.aggregations.items()):
        fact = next(fact for fact in definition.facts if fact.alias == outputs[code]["source_alias"])
        identity = sources[fact.alias].c[fact.fact_key]
        # 以事实身份去重，金额相同的两条事实仍分别计入。
        rows = select(*dimensions, identity.label("_fact_id"), expression(code).label("_value")).select_from(joined).where(identity.is_not(None), *clauses).distinct().cte(f"metric_rows_{index}")
        aggregate = getattr(func, aggregation)(rows.c._value).label(code)
        metric = select(*(rows.c[key] for key in plan.group_by), aggregate).group_by(*(rows.c[key] for key in plan.group_by)).cte(f"metric_{index}")
        if result_from is None:
            result_from = metric
        else:
            condition = and_(*(groups.c[key].is_not_distinct_from(metric.c[key]) for key in plan.group_by)) if groups is not None else true()
            result_from = result_from.join(metric, condition, isouter=groups is not None)
        selected[code] = func.coalesce(metric.c[code], 0).label(code) if aggregation == "count" else metric.c[code]
    return select(*(selected[code] for code in plan.output_fields)).select_from(result_from), []
