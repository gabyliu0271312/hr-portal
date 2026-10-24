"""单事实 D/S 合同校验与 SQL 编译；运行入口必须先核对服务端准入。"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Mapping

from pydantic import BaseModel, Field, ValidationError
from sqlalchemy import String, cast, false, func, or_, select
from sqlalchemy.orm import aliased
from sqlalchemy.sql.elements import False_

from app.datasets.authorization_contract import ProductAuthorizationDefinition
from app.warehouse.schemas import ExecutionPlanIn


@dataclass(frozen=True)
class DExecutionContractSnapshot:
    """服务端读取的授权合同快照；不接受客户端伪造的合同状态。"""

    contract_id: int
    dataset_id: int
    contract_version: int
    status: str
    definition: ProductAuthorizationDefinition
    model_snapshot: Mapping[str, Any]
    runtime_enabled: bool = False


class DExecutionBindingIn(BaseModel):
    model_config = {"extra": "forbid"}

    dataset_id: int = Field(strict=True, ge=1)
    contract_id: int = Field(strict=True, ge=1)
    contract_version: int = Field(strict=True, ge=1)
    plan: ExecutionPlanIn


class DExecutionValidationOut(BaseModel):
    dataset_id: int
    contract_id: int | None
    contract_version: int | None
    shape: str
    detail_path: str
    eligible: bool
    runtime_enabled: bool = False
    output_fields: list[str] = []
    filters: list[str] = []
    order_by: list[str] = []
    issues: list[dict[str, str]] = []


class SExecutionBindingIn(BaseModel):
    model_config = {"extra": "forbid"}

    dataset_id: int = Field(strict=True, ge=1)
    contract_id: int = Field(strict=True, ge=1)
    contract_version: int = Field(strict=True, ge=1)
    plan: ExecutionPlanIn


class SExecutionValidationOut(BaseModel):
    dataset_id: int
    contract_id: int | None
    contract_version: int | None
    shape: str
    summary_path: str
    eligible: bool
    runtime_enabled: bool = False
    output_fields: list[str] = []
    group_by: list[str] = []
    aggregations: dict[str, str] = {}
    issues: list[dict[str, str]] = []


def _s_issue(code: str, message: str) -> dict[str, str]:
    return {"code": code, "message": message}


def _semantic_locator_codes(outputs, semantics_by_output, anchor_field_id):
    """按标准字段语义识别人员定位输出，而不只看合同声明的物理键。"""
    codes = set()
    for code, item in outputs.items():
        semantic = semantics_by_output.get(item["id"])
        if semantic is None:
            continue
        _binding, version = semantic
        if (version.grain_level == "identifying" or version.permission_domain == "personal"
                or (anchor_field_id is not None and version.standard_field_id == anchor_field_id)):
            codes.add(code)
    return codes


def validate_allocation_fact_s_execution(contract, request):
    """Validate a server-bound S plan without accepting client scope controls."""
    try:
        bound_contract = _as_contract(contract)
        bound_request = request if isinstance(request, SExecutionBindingIn) else SExecutionBindingIn.model_validate(request)
    except (KeyError, TypeError, ValueError, ValidationError):
        return SExecutionValidationOut(
            dataset_id=0, contract_id=None, contract_version=None, shape="blocked",
            summary_path="not_allowed", eligible=False,
            issues=[_s_issue("authorization_contract_invalid", "授权合同快照未通过服务端校验")],
        )
    issues: list[dict[str, str]] = []
    if bound_contract.status != "active":
        issues.append(_s_issue("authorization_contract_not_active", "只有active授权合同可以进入S执行校验"))
    if bound_contract.runtime_enabled:
        issues.append(_s_issue("runtime_enablement_forbidden", "执行资格必须由服务端当前准入判定，不能由合同快照开启"))
    if bound_request.dataset_id != bound_contract.dataset_id:
        issues.append(_s_issue("execution_dataset_mismatch", "执行计划与授权合同数据集不匹配"))
    if bound_request.contract_id != bound_contract.contract_id:
        issues.append(_s_issue("execution_contract_mismatch", "执行计划未绑定当前授权合同"))
    if bound_request.contract_version != bound_contract.contract_version:
        issues.append(_s_issue("execution_contract_version_mismatch", "执行计划未绑定当前授权合同版本"))
    definition = bound_contract.definition
    if len(definition.facts) != 1:
        issues.append(_s_issue("s_execution_requires_one_fact", "S执行切片只允许一个事实来源"))
    else:
        fact = definition.facts[0]
        if fact.role != "allocation_fact":
            issues.append(_s_issue("s_execution_allocation_fact_required", "S执行切片只允许allocation_fact"))
        if not fact.allow_cost_center_summary or not fact.cost_center_key:
            issues.append(_s_issue("s_execution_cost_center_path_required", "S执行切片必须声明获准成本中心汇总路径"))
        if not fact.employee_key:
            issues.append(_s_issue("s_execution_employee_key_required", "allocation_fact必须声明人员键"))
    snapshot = bound_contract.model_snapshot
    tables = snapshot.get("tables") if isinstance(snapshot, dict) else None
    relations = snapshot.get("relations") if isinstance(snapshot, dict) else None
    outputs = snapshot.get("outputs") if isinstance(snapshot, dict) else None
    fact = definition.facts[0] if len(definition.facts) == 1 else None
    if not isinstance(tables, list) or len(tables) != 1:
        issues.append(_s_issue("s_execution_requires_one_table", "S执行切片只允许一个来源表"))
    elif fact is not None and (not isinstance(tables[0], dict)
            or type(tables[0].get("id")) is not int
            or tables[0].get("alias") != fact.alias or tables[0].get("table_name") != fact.table_name):
        issues.append(_s_issue("s_execution_fact_table_mismatch", "S执行来源表未绑定批准事实"))
    if not isinstance(relations, list) or relations:
        issues.append(_s_issue("s_execution_join_forbidden", "S执行切片不允许JOIN"))
    valid_outputs = isinstance(outputs, list) and all(
        isinstance(item, dict) and type(item.get("id")) is int
        and isinstance(item.get("output_code"), str) and bool(item["output_code"])
        and isinstance(item.get("source_column"), str) and bool(item["source_column"])
        and isinstance(item.get("data_type"), str)
        and item["data_type"] in {"string", "number", "date", "datetime", "bool", "enum"}
        and type(item.get("is_visible")) is bool and type(item.get("is_sensitive")) is bool
        for item in outputs)
    if not valid_outputs:
        issues.append(_s_issue("authorization_snapshot_invalid", "授权合同输出结构快照无效"))
    elif fact is not None:
        output_by_code = {item["output_code"]: item for item in outputs}
        if (len(output_by_code) != len(outputs) or not set(definition.output_fields) <= set(output_by_code)
                or len({item["id"] for item in outputs}) != len(outputs)
                or any(item.get("source_alias") != fact.alias for item in outputs)):
            issues.append(_s_issue("s_execution_fact_output_mismatch", "S执行输出必须全部来自批准分摊事实"))
        bound_keys = {item["source_column"] for item in outputs}
        bound_keys |= {field.removeprefix(f"{fact.alias}.") for field in definition.internal_fields
                       if field.startswith(f"{fact.alias}.")}
        if not {fact.fact_key, fact.employee_key, fact.cost_center_key} <= bound_keys:
            issues.append(_s_issue("s_execution_anchor_unbound", "S执行授权锚点未绑定批准事实"))
        identifying = {code for code, item in output_by_code.items()
                       if item["source_column"] in {fact.employee_key, fact.fact_key}}
        if set(bound_request.plan.aggregations) & identifying:
            issues.append(_s_issue("s_execution_personal_locator_forbidden", "人员键聚合须独立批准，当前切片不支持"))
        from app.reports.execution_plan import compile_execution_plan
        shape = compile_execution_plan(bound_request.dataset_id, bound_request.plan,
            allowed_fields=set(definition.output_fields), measures=set(definition.measures),
            approved_summary=True, identifying_fields=identifying)
        issues.extend(shape.issues)
    plan = bound_request.plan
    if not plan.aggregations:
        issues.append(_s_issue("s_execution_summary_required", "S执行切片必须包含度量聚合"))
    if len(set(plan.output_fields)) != len(plan.output_fields):
        issues.append(_s_issue("s_execution_duplicate_output", "S执行输出不可重复"))
    if set(plan.group_by) - set(definition.dimensions):
        issues.append(_s_issue("s_execution_dimension_not_allowed", "分组字段不在批准维度中"))
    if plan.personal_fields or plan.employee_keys:
        issues.append(_s_issue("s_execution_personal_locator_forbidden", "S执行切片不允许个人定位字段"))
    if plan.filters or plan.order_by:
        issues.append(_s_issue("s_execution_plan_unsupported", "当前S切片不支持筛选或排序覆盖"))
    if "count_distinct" in plan.aggregations.values():
        issues.append(_s_issue("s_execution_aggregation_unsupported", "人数指标须独立批准，当前切片不支持"))
    if issues:
        return SExecutionValidationOut(
            dataset_id=bound_request.dataset_id, contract_id=bound_request.contract_id,
            contract_version=bound_request.contract_version, shape="blocked", summary_path="not_allowed",
            eligible=False, output_fields=list(bound_request.plan.output_fields),
            group_by=list(bound_request.plan.group_by), aggregations=dict(bound_request.plan.aggregations), issues=issues,
        )
    return SExecutionValidationOut(
        dataset_id=bound_request.dataset_id, contract_id=bound_request.contract_id,
        contract_version=bound_request.contract_version, shape="summary", summary_path="person_or_cost_center_scope",
        eligible=True, output_fields=list(bound_request.plan.output_fields), group_by=list(bound_request.plan.group_by),
        aggregations=dict(bound_request.plan.aggregations), issues=[],
    )


async def compile_allocation_fact_s_scope(*, user, fact, model, db, table_alias=None):
    """Build one server-side S scope: person scope OR approved cost-center scope."""
    if fact.role != "allocation_fact" or not fact.allow_cost_center_summary or not fact.cost_center_key:
        return None, [_s_issue("s_execution_cost_center_path_invalid", "S执行事实未批准成本中心汇总路径")]
    from app.data.models import DATA_TABLES, OrgNode, CostCenterNode
    from app.permissions import scope_filter
    from app.warehouse.service.tree_health import analyze_tree

    roster = DATA_TABLES.get(scope_filter.ROSTER_TABLE)
    if (roster is None or "raw" in roster.__table__.columns
            or scope_filter.ROSTER_EMP_COL not in roster.__table__.columns
            or model is not DATA_TABLES.get(fact.table_name)
            or not {fact.fact_key, fact.employee_key, fact.cost_center_key} <= set(model.__table__.columns.keys())):
        return None, [_s_issue("s_execution_scope_configuration_invalid", "事实或人员授权锚点不可用")]
    for kind, tree in (("org", OrgNode), ("cost_center", CostCenterNode)):
        nodes = (await db.execute(select(tree))).scalars().all()
        if not analyze_tree(kind, nodes).eligible:
            return None, [_s_issue("s_execution_tree_invalid", "授权依赖的权限树未通过检查")]
    roster_roles = await scope_filter._get_role_columns(scope_filter.ROSTER_TABLE, db)
    center_roles = await scope_filter._get_role_columns(fact.table_name, db)
    if (roster_roles.get("org_node_code") not in set(roster.__table__.columns.keys())
            or center_roles.get("cc_code") != fact.cost_center_key):
        return None, [_s_issue("s_execution_scope_configuration_invalid", "人员或成本中心范围配置与合同不一致")]
    tags = await scope_filter._get_user_tags(user.id, db)
    for tag, _, filters in tags:
        if tag.person_scope_enabled and (not filters or any(
                roster_roles.get(item.field_code) not in set(roster.__table__.columns.keys()) for item in filters)):
            return None, [_s_issue("s_execution_scope_configuration_invalid", "人员条件未能完整解析")]
    roster_alias = aliased(roster, name="s_scope_roster")
    personnel = await scope_filter.build_scope_filter(
        user, scope_filter.ROSTER_TABLE, db, strategy="person_first", table_alias=roster_alias)
    if scope_filter.is_unrestricted(personnel):
        return None, [_s_issue("s_execution_unrestricted_scope_unverified", "无限人员范围尚未完成运行资格校验")]
    effective_model = model if table_alias is None else (
        aliased(model, name=table_alias) if isinstance(table_alias, str) else table_alias)
    person_scope = false() if isinstance(personnel, False_) else scope_filter._entity_text(
        effective_model, fact.employee_key).in_(select(
            scope_filter._entity_text(roster_alias, scope_filter.ROSTER_EMP_COL)).where(personnel))
    center_clauses = []
    for tag, selections, filters in scope_filter._filter_tags_by_strategy(tags, "cc_first"):
        center_clauses.append(await scope_filter._build_tag_clause_with_passthrough(
            tag, selections, filters, effective_model, {"cc_code": fact.cost_center_key}, db,
            roster_join_col=fact.employee_key, roster_role_cols=roster_roles))
    center_scope = or_(*center_clauses) if center_clauses else false()
    if scope_filter.is_unrestricted(center_scope):
        return None, [_s_issue("s_execution_unrestricted_scope_unverified", "无限中心范围尚未完成运行资格校验")]
    if isinstance(person_scope, False_) and isinstance(center_scope, False_):
        return None, [_s_issue("s_execution_scope_denied", "当前用户没有可解析的人员或成本中心汇总范围")]
    return or_(person_scope, center_scope), []


async def compile_allocation_fact_s_select_for_user(*, contract, request, user, db):
    """Compile S aggregation from a server-bound contract with current field and scope checks."""
    from app.data.models import DATA_TABLES, TableColumn
    from app.permissions.masker import get_hidden_columns
    from app.reports.sql_builder import _entity_column

    validation = validate_allocation_fact_s_execution(contract, request)
    if not validation.eligible:
        return None, validation.issues
    if request.plan.filters or request.plan.order_by or request.plan.personal_fields or request.plan.employee_keys:
        return None, [_s_issue("s_execution_plan_unsupported", "S汇总暂不接受个人定位、排序或客户端筛选覆盖")]
    bound_contract = _as_contract(contract)
    fact = bound_contract.definition.facts[0]
    model = DATA_TABLES.get(fact.table_name)
    if model is None or model.__table__.name != fact.table_name or "raw" in model.__table__.columns:
        return None, [_s_issue("s_execution_entity_model_required", "S汇总必须使用合同声明的实体列事实")]
    columns = (await db.execute(select(TableColumn).where(TableColumn.table_name == fact.table_name))).scalars().all()
    current_columns = {column.column_code: column for column in columns}
    from types import SimpleNamespace
    from app.datasets.authorization_contract import _collect_contract_physical_drift
    from app.warehouse.service.standardization import _normalized_metadata_type
    outputs = {item["output_code"]: item for item in bound_contract.model_snapshot["outputs"]}
    physical_issues = await _collect_contract_physical_drift(db, bound_contract.definition,
        [SimpleNamespace(**item) for item in bound_contract.model_snapshot["tables"]], [],
        [SimpleNamespace(**item) for item in outputs.values()])
    if physical_issues:
        return None, physical_issues
    required = {fact.fact_key, fact.employee_key, fact.cost_center_key}
    required |= {outputs[code]["source_column"] for code in request.plan.output_fields}
    if not required <= set(current_columns) or not required <= set(model.__table__.columns.keys()):
        return None, [_s_issue("s_execution_source_column_missing", "事实字段物理来源不存在")]
    for code in required:
        type_issue = _type_issue_for_column(model, current_columns[code], code)
        if type_issue:
            return None, [type_issue]
    from app.data.models import StandardFieldBinding, StandardFieldVersion
    from app.datasets.models import DatasetOutputField
    current_outputs = (await db.execute(select(DatasetOutputField).where(
        DatasetOutputField.dataset_id == bound_contract.dataset_id,
        DatasetOutputField.id.in_([output["id"] for output in outputs.values()])))).scalars().all()
    current_outputs_by_id = {output.id: output for output in current_outputs}
    for expected in outputs.values():
        current = current_outputs_by_id.get(expected["id"])
        if current is None or any(getattr(current, key) != expected[key] for key in (
                "source_alias", "source_column", "output_code", "data_type", "is_visible", "is_sensitive")):
            return None, [_s_issue("s_execution_output_drift", "当前数据集输出已偏离批准快照")]
    semantics = (await db.execute(select(StandardFieldBinding, StandardFieldVersion).join(
        StandardFieldVersion, StandardFieldVersion.id == StandardFieldBinding.standard_field_version_id
    ).where(or_(
        StandardFieldBinding.table_column_id.in_([current_columns[code].id for code in required]),
        StandardFieldBinding.dataset_output_field_id.in_([output["id"] for output in outputs.values()])
    )))).all()
    semantics_by_column = {binding.table_column_id: (binding, version) for binding, version in semantics
                           if binding.table_column_id is not None}
    semantics_by_output = {binding.dataset_output_field_id: (binding, version) for binding, version in semantics
                           if binding.dataset_output_field_id is not None}
    anchor_field_id = None
    if fact.employee_key:
        anchor_field_id = await db.scalar(
            select(StandardFieldVersion.standard_field_id)
            .select_from(TableColumn)
            .join(StandardFieldBinding, StandardFieldBinding.table_column_id == TableColumn.id)
            .join(StandardFieldVersion, StandardFieldVersion.id == StandardFieldBinding.standard_field_version_id)
            .where(TableColumn.table_name == fact.table_name,
                   TableColumn.column_code == fact.employee_key,
                   StandardFieldBinding.status == "confirmed",
                   StandardFieldVersion.status == "active")
            .limit(1)
        )
    semantic_locators = _semantic_locator_codes(outputs, semantics_by_output, anchor_field_id)
    locator_refs = (set(request.plan.output_fields) | set(request.plan.group_by)
                    | set(request.plan.aggregations) | set(request.plan.filters)
                    | set(request.plan.order_by)) & semantic_locators
    if locator_refs:
        return None, [_s_issue("s_execution_personal_locator_forbidden", "人员定位字段不能通过汇总路径使用")]
    checked_versions = set()
    from app.warehouse.service.standard_fields import _physical_source_identity
    for code in request.plan.output_fields:
        output = outputs[code]
        column = current_columns[output["source_column"]]
        identity = column.source_field_id or _physical_source_identity(column.table_name, column.column_code)
        for semantic in (semantics_by_column.get(column.id), semantics_by_output.get(output["id"])):
            if semantic is None:
                return None, [_s_issue("s_execution_semantic_unverified", "汇总来源或输出缺少批准语义绑定")]
            binding, version = semantic
            if (binding.status != "confirmed" or binding.confirmed_by is None or binding.confirmed_at is None
                    or binding.binding_version <= 0 or binding.observed_source_field_id != identity
                    or binding.observed_data_type != column.data_type
                    or version.status != "active" or version.approved_by is None or version.approved_at is None
                    or not (version.approval_reason or "").strip() or version.data_type != column.data_type
                    or version.grain_level == "identifying"
                    or (code in request.plan.group_by and version.grain_level not in {"coarse", "fine"})):
                return None, [_s_issue("s_execution_semantic_unverified", "汇总来源或输出语义未通过检查")]
            checked_versions.add(version.id)
    from app.data.models import StandardFieldVersionCategory
    from app.field_category.models import FieldCategory
    from app.permissions.masker import _user_allowed_categories
    semantic_categories = (await db.execute(select(StandardFieldVersionCategory.field_category_id).join(
        FieldCategory, FieldCategory.id == StandardFieldVersionCategory.field_category_id
    ).where(StandardFieldVersionCategory.standard_field_version_id.in_(
        checked_versions), FieldCategory.is_sensitive.is_(True)))).scalars().all()
    if set(semantic_categories) - await _user_allowed_categories(user, db):
        return None, [_s_issue("s_execution_hidden_field_forbidden", "当前用户没有汇总字段的敏感分类权限")]
    from sqlalchemy import inspect
    connection = await db.connection()
    actual_primary_key = await connection.run_sync(lambda sync: inspect(sync).get_pk_constraint(
        fact.table_name, schema=model.__table__.schema).get("constrained_columns", []))
    if actual_primary_key != [fact.fact_key]:
        return None, [_s_issue("s_execution_fact_identity_unverified", "当前切片要求事实键为唯一物理主键")]
    hidden = await get_hidden_columns(user, fact.table_name, db, tool_key=None)
    if hidden is None:
        return None, [_s_issue("s_execution_field_access_unresolved", "字段授权尚未完成裁决")]
    protected = set(hidden) | {column.column_code for column in columns if column.is_sensitive or not column.is_visible}
    outputs = {item["output_code"]: item for item in bound_contract.model_snapshot["outputs"]}
    projected = []
    group_columns = []
    for output_code in request.plan.group_by:
        output = outputs[output_code]
        source_column = output["source_column"]
        if (output.get("is_visible") is not True or output.get("is_sensitive") is not False
                or source_column in protected or output_code in protected):
            return None, [_s_issue("s_execution_hidden_field_forbidden", "执行计划包含当前用户不可见字段")]
        if source_column not in current_columns or source_column not in model.__table__.columns:
            return None, [_s_issue("s_execution_source_column_missing", "执行计划字段物理来源不存在")]
        expression = _entity_column(model, source_column).label(output_code)
        projected.append(expression)
        group_columns.append(expression)
    for output_code, aggregation in request.plan.aggregations.items():
        output = outputs[output_code]
        source_column = output["source_column"]
        if (output.get("is_visible") is not True or output.get("is_sensitive") is not False
                or source_column in protected or output_code in protected):
            return None, [_s_issue("s_execution_hidden_field_forbidden", "执行计划包含当前用户不可见字段")]
        if source_column not in current_columns or source_column not in model.__table__.columns:
            return None, [_s_issue("s_execution_source_column_missing", "执行计划字段物理来源不存在")]
        expression = _entity_column(model, source_column)
        source_type = _normalized_metadata_type(current_columns[source_column].data_type)
        output_type = _normalized_metadata_type(output.get("data_type"))
        if ((aggregation in {"sum", "avg"} and source_type != "number")
                or (aggregation in {"min", "max"} and source_type not in {"number", "string", "enum", "date", "datetime"})):
            return None, [_s_issue("s_execution_aggregation_type_invalid", "聚合函数与度量类型不兼容")]
        if output_type and source_type != output_type and not (output_type == "enum" and source_type == "string"):
            return None, [_s_issue("s_execution_physical_type_drift", "汇总输出类型与物理度量类型不一致")]
        aggregate = {
            "sum": func.sum,
            "count": func.count,
            "avg": func.avg,
            "min": func.min,
            "max": func.max,
        }.get(aggregation)
        if aggregate is None:
            return None, [_s_issue("s_execution_aggregation_unsupported", "S汇总聚合函数未通过服务端校验")]
        projected.append(aggregate(expression).label(output_code))
    scope, issues = await compile_allocation_fact_s_scope(
        user=user, fact=fact, model=model, db=db)
    if issues or scope is None:
        return None, issues or [_s_issue("s_execution_scope_denied", "当前用户没有可解析的汇总范围")]
    return select(*projected).where(scope).group_by(*group_columns), []


async def compile_allocation_fact_s_result_statements_for_user(
        *, contract, request, user, db, page=1, page_size=100):
    if (type(page) is not int or type(page_size) is not int
            or page < 1 or page_size < 0 or page_size > 1000):
        return None, [_s_issue("s_execution_pagination_invalid", "分页参数未通过校验")]
    statement, issues = await compile_allocation_fact_s_select_for_user(
        contract=contract, request=request, user=user, db=db)
    if issues:
        return None, issues
    result = statement.subquery("authorized_summary")
    full = select(*(result.c[code] for code in request.plan.output_fields))
    if request.plan.group_by:
        full = full.order_by(*(result.c[code].asc().nulls_last() for code in request.plan.group_by))
    preview = full.limit(page_size).offset((page - 1) * page_size) if page_size else full
    return {"count": select(func.count()).select_from(result), "preview": preview, "export": full}, []


async def compile_allocation_fact_s_select_for_dataset(*, db, user, request):
    from app.datasets.authorization_contract import execution_readiness
    from app.datasets.models import DataProductAuthorizationContract
    readiness = await execution_readiness(db, request.dataset_id, user)
    if not readiness.eligible or not readiness.runtime_enabled:
        return None, readiness.issues or [_s_issue("s_execution_runtime_disabled", "S汇总执行尚未获得运行资格")]
    row = await db.get(DataProductAuthorizationContract, readiness.contract_id)
    if row is None:
        return None, [_s_issue("authorization_contract_missing", "授权合同不存在")]
    contract = {"id": row.id, "dataset_id": row.dataset_id, "contract_version": row.contract_version,
                "status": row.status, "contract_json": row.contract_json, "model_snapshot": row.model_snapshot}
    return await compile_allocation_fact_s_select_for_user(
        contract=contract, request=request, user=user, db=db)


def compile_allocation_fact_s_select(*, contract, request, user, db):
    """Runtime remains closed; validation is intentionally separate from SQL execution."""
    result = validate_allocation_fact_s_execution(contract, request)
    if not result.eligible:
        return None, result.issues
    return None, [_s_issue("s_execution_runtime_disabled", "S汇总执行尚未接入运行时查询")]



def _scope_issue(code: str, message: str) -> dict[str, str]:
    return {"code": code, "message": message}


def _contains_false_clause(clause) -> bool:
    return isinstance(clause, False_)


def _physical_type_name_from_model(column) -> str | None:
    raw_type = str(column.type).lower()
    if raw_type.startswith(("bigint", "integer", "smallint", "numeric", "decimal", "double", "real", "float")):
        return "number"
    if raw_type.startswith("date"):
        return "date"
    if raw_type.startswith("timestamp") or raw_type.startswith("datetime"):
        return "datetime"
    if raw_type.startswith(("boolean", "bool")):
        return "bool"
    if raw_type.startswith(("text", "varchar", "character varying", "char")):
        return "string"
    return None


def _type_issue_for_column(model, metadata, column_code: str) -> dict[str, str] | None:
    declared = getattr(metadata, "data_type", None)
    physical = _physical_type_name_from_model(model.__table__.c[column_code])
    if declared and physical and declared != physical and not (declared == "enum" and physical == "string"):
        return _scope_issue("d_execution_physical_type_drift", "事实字段元数据类型与物理类型不一致")
    if physical is None:
        return _scope_issue("d_execution_physical_type_unknown", "事实字段物理类型未通过受控校验")
    return None


async def compile_person_fact_d_scope(*, user, table: str, model, db, table_alias: str | object | None = None):
    """Compile only the existing personnel scope primitive; never enables runtime by itself."""
    from app.permissions.scope_filter import build_scope_filter

    clause = await build_scope_filter(user, table, db, strategy="person_first", table_alias=table_alias)
    if _contains_false_clause(clause):
        return None, [_scope_issue("d_execution_scope_denied", "当前用户没有可解析的人员范围")]
    return clause, []


async def compile_person_fact_d_membership(*, user, fact, db):
    """Derive D from the personnel roster; never use legacy fact scope as a substitute."""
    from app.data.models import DATA_TABLES
    from app.permissions.scope_filter import ROSTER_EMP_COL, ROSTER_TABLE, _entity_text, is_unrestricted

    roster = DATA_TABLES.get(ROSTER_TABLE)
    fact_model = DATA_TABLES.get(fact.table_name)
    if (roster is None or fact_model is None or fact.role != "person_fact"
            or not fact.employee_key or fact.allow_cost_center_summary or fact.cost_center_key
            or "raw" in roster.__table__.columns or "raw" in fact_model.__table__.columns
            or ROSTER_EMP_COL not in roster.__table__.columns
            or fact.employee_key not in fact_model.__table__.columns):
        return None, [_scope_issue("d_execution_membership_unresolved", "人员事实或花名册授权锚点不可用")]
    roster_alias = aliased(roster, name="d_scope_roster")
    roster_scope, issues = await compile_person_fact_d_scope(
        user=user, table=ROSTER_TABLE, model=roster, db=db, table_alias=roster_alias
    )
    if issues:
        return None, issues
    if is_unrestricted(roster_scope):
        return None, [_scope_issue("d_execution_membership_unrestricted", "人员范围尚未完成受控资格核验")]
    members = select(_entity_text(roster_alias, ROSTER_EMP_COL)).where(roster_scope)
    return cast(fact_model.__table__.c[fact.employee_key], String).in_(members), []


async def compile_person_fact_d_select_for_dataset(*, db, user, request: DExecutionBindingIn):
    """Fail closed until the complete server-side D authorization gate is integrated."""
    from app.datasets.authorization_contract import execution_readiness

    readiness = await execution_readiness(db, request.dataset_id, user)
    if not readiness.eligible:
        return None, readiness.issues
    return None, [_scope_issue("d_execution_runtime_disabled", "D明细执行准备尚未获得运行资格")]


async def compile_person_fact_d_select_for_user(*, contract: DExecutionContractSnapshot, request: DExecutionBindingIn, user, db):
    """Resolve current field visibility and personnel scope before compiling the D projection."""
    from app.data.models import DATA_TABLES, TableColumn
    from app.permissions.masker import get_hidden_columns
    from sqlalchemy import select

    validation = validate_person_fact_d_execution(contract, request)
    if not validation.eligible:
        return None, validation.issues
    if request.plan.filters or request.plan.order_by or request.plan.personal_fields or request.plan.employee_keys:
        return None, [_scope_issue("d_execution_plan_unsupported", "D明细投影暂不支持筛选、排序或个人定位依赖")]
    fact = contract.definition.facts[0]
    model = DATA_TABLES.get(fact.table_name)
    if model is None or model.__table__.name != fact.table_name or "raw" in model.__table__.columns:
        return None, [_scope_issue("d_execution_entity_model_required", "D明细投影必须使用合同声明的实体列事实")]
    columns = (await db.execute(select(TableColumn).where(TableColumn.table_name == fact.table_name))).scalars().all()
    current_columns = {column.column_code: column for column in columns}
    if fact.employee_key not in current_columns or fact.fact_key not in current_columns:
        return None, [_scope_issue("d_execution_column_metadata_missing", "事实授权锚点元数据不存在")]
    for column_code in {fact.employee_key, fact.fact_key}:
        type_issue = _type_issue_for_column(model, current_columns[column_code], column_code)
        if type_issue:
            return None, [type_issue]
    outputs = {item["output_code"]: item for item in contract.model_snapshot["outputs"]}
    if any(item["source_column"] not in current_columns for item in outputs.values()):
        return None, [_scope_issue("d_execution_column_metadata_missing", "事实输出字段元数据不存在")]
    hidden = await get_hidden_columns(user, fact.table_name, db, tool_key=None)
    if hidden is None:
        return None, [_scope_issue("d_execution_field_access_unresolved", "字段授权尚未完成裁决")]
    protected = set(hidden) | {column.column_code for column in columns if column.is_sensitive or not column.is_visible}
    from app.reports.sql_builder import _entity_column
    projected = []
    for output_code in request.plan.output_fields:
        output = outputs[output_code]
        source_column = output["source_column"]
        if (output.get("is_visible") is not True or output.get("is_sensitive") is not False
                or source_column in protected or output_code in protected):
            return None, [_scope_issue("d_execution_hidden_field_forbidden", "执行计划包含当前用户不可见字段")]
        if source_column not in model.__table__.columns:
            return None, [_scope_issue("d_execution_source_column_missing", "执行计划字段物理来源不存在")]
        output_type = output.get("data_type")
        physical_type = _physical_type_name_from_model(model.__table__.c[source_column])
        if output_type and physical_type and output_type != physical_type and not (output_type == "enum" and physical_type == "string"):
            return None, [_scope_issue("d_execution_physical_type_drift", "执行计划输出字段类型与物理类型不一致")]
        projected.append(_entity_column(model, source_column).label(output_code))
    membership, issues = await compile_person_fact_d_membership(user=user, fact=fact, db=db)
    if issues:
        return None, issues
    if membership is None or _contains_false_clause(membership):
        return None, [_scope_issue("d_execution_scope_required", "执行D明细必须先完成受控人员范围裁决")]
    from app.permissions.scope_filter import is_unrestricted
    if is_unrestricted(membership):
        return None, [_scope_issue("d_execution_membership_unrestricted", "人员范围尚未完成受控资格核验")]
    return select(*projected).where(membership), []


def _blocked(
    request: DExecutionBindingIn | None,
    issues: list[dict[str, str]],
) -> DExecutionValidationOut:
    return DExecutionValidationOut(
        dataset_id=request.dataset_id if request else 0,
        contract_id=request.contract_id if request else None,
        contract_version=request.contract_version if request else None,
        shape="blocked",
        detail_path="not_allowed",
        eligible=False,
        runtime_enabled=False,
        output_fields=list(request.plan.output_fields) if request else [],
        filters=list(request.plan.filters) if request else [],
        order_by=list(request.plan.order_by) if request else [],
        issues=issues,
    )


def _issue(code: str, message: str) -> dict[str, str]:
    return {"code": code, "message": message}


def _as_contract(value: DExecutionContractSnapshot | Mapping[str, Any]) -> DExecutionContractSnapshot:
    if isinstance(value, DExecutionContractSnapshot):
        return value
    definition = value.get("definition", value.get("contract_json"))
    if definition is None:
        raise ValueError("授权合同缺少定义")
    if not isinstance(definition, ProductAuthorizationDefinition):
        definition = ProductAuthorizationDefinition.model_validate(definition)
    snapshot = value.get("model_snapshot")
    if not isinstance(snapshot, Mapping):
        raise ValueError("授权合同缺少模型快照")
    return DExecutionContractSnapshot(
        contract_id=int(value["contract_id"] if "contract_id" in value else value["id"]),
        dataset_id=int(value["dataset_id"]),
        contract_version=int(value["contract_version"]),
        status=str(value["status"]),
        definition=definition,
        model_snapshot=snapshot,
        runtime_enabled=bool(value.get("runtime_enabled", False)),
    )


def validate_person_fact_d_execution(
    contract: DExecutionContractSnapshot | Mapping[str, Any],
    request: DExecutionBindingIn | Mapping[str, Any],
) -> DExecutionValidationOut:
    """校验最小 D 执行切片的服务端合同与请求计划绑定。

    该函数不读取数据库、不执行 SQL、不修改状态。合同快照应由服务端从
    active 合同记录读取；任何身份、结构或计划不确定均返回 blocked。
    """
    try:
        bound_contract = _as_contract(contract)
    except (KeyError, TypeError, ValueError, ValidationError):
        return _blocked(None, [_issue("authorization_contract_invalid", "授权合同快照未通过服务端校验")])

    try:
        bound_request = request if isinstance(request, DExecutionBindingIn) else DExecutionBindingIn.model_validate(request)
    except ValidationError as exc:
        return _blocked(None, [_issue("execution_binding_invalid", "执行计划绑定参数未通过校验")])

    issues: list[dict[str, str]] = []
    if bound_contract.status != "active":
        issues.append(_issue("authorization_contract_not_active", "只有active授权合同可以进入D执行校验"))
    if bound_contract.runtime_enabled:
        issues.append(_issue("runtime_enablement_forbidden", "D执行切片不允许开启runtime_enabled"))
    if bound_request.dataset_id != bound_contract.dataset_id:
        issues.append(_issue("execution_dataset_mismatch", "执行计划与授权合同数据集不匹配"))
    if bound_request.contract_id != bound_contract.contract_id:
        issues.append(_issue("execution_contract_mismatch", "执行计划未绑定当前授权合同"))
    if bound_request.contract_version != bound_contract.contract_version:
        issues.append(_issue("execution_contract_version_mismatch", "执行计划未绑定当前授权合同版本"))

    definition = bound_contract.definition
    if len(definition.facts) != 1:
        issues.append(_issue("d_execution_requires_one_fact", "D执行切片只允许一个事实来源"))
    else:
        fact = definition.facts[0]
        if fact.role != "person_fact":
            issues.append(_issue("d_execution_person_fact_required", "D执行切片只允许person_fact"))
        if fact.allow_cost_center_summary or fact.cost_center_key:
            issues.append(_issue("d_execution_cost_center_forbidden", "D执行切片不允许成本中心汇总路径"))
        if not fact.employee_key:
            issues.append(_issue("d_execution_employee_key_required", "person_fact必须声明人员键"))

    snapshot = bound_contract.model_snapshot
    tables = snapshot.get("tables")
    relations = snapshot.get("relations")
    outputs = snapshot.get("outputs")
    if not isinstance(tables, list) or len(tables) != 1:
        issues.append(_issue("d_execution_requires_one_table", "D执行切片只允许一个来源表"))
    elif len(definition.facts) == 1:
        table = tables[0]
        fact = definition.facts[0]
        if (not isinstance(table, dict) or not isinstance(table.get("id"), int)
                or table.get("alias") != fact.alias or table.get("table_name") != fact.table_name):
            issues.append(_issue("d_execution_fact_table_mismatch", "模型来源表未绑定声明事实"))
    if not isinstance(relations, list) or relations:
        issues.append(_issue("d_execution_join_forbidden", "D执行切片不允许JOIN"))
    if not isinstance(outputs, list) or any(not isinstance(item, dict) for item in outputs):
        issues.append(_issue("authorization_snapshot_invalid", "授权合同输出结构快照无效"))
    elif len(definition.facts) == 1:
        fact = definition.facts[0]
        by_code = {item.get("output_code"): item for item in outputs}
        if (len(by_code) != len(outputs) or not set(definition.output_fields) <= set(by_code)
                or any(not isinstance(item.get("id"), int)
                       or item.get("source_alias") != fact.alias
                       or not isinstance(item.get("source_column"), str)
                       or not item["source_column"] for item in outputs)):
            issues.append(_issue("d_execution_output_snapshot_mismatch", "合同输出白名单与事实字段快照不匹配"))
        available_keys = {item["source_column"] for item in outputs
                          if item.get("source_alias") == fact.alias and isinstance(item.get("source_column"), str)}
        available_keys |= {field.removeprefix(f"{fact.alias}.") for field in definition.internal_fields
                           if field.startswith(f"{fact.alias}.")}
        if fact.employee_key not in available_keys:
            issues.append(_issue("d_execution_employee_key_unbound", "人员键未绑定到事实来源字段"))
        if fact.fact_key not in available_keys:
            issues.append(_issue("d_execution_fact_key_unbound", "事实键未绑定到事实来源字段"))

    plan = bound_request.plan
    allowed_fields = set(definition.output_fields)
    plan_refs = set(plan.output_fields) | set(plan.filters) | set(plan.order_by)
    plan_refs |= set(plan.group_by) | set(plan.aggregations) | set(plan.personal_fields) | set(plan.employee_keys)
    unknown = sorted(plan_refs - allowed_fields)
    if unknown:
        issues.append(_issue("d_execution_field_not_allowed", "执行计划字段不在合同输出白名单: " + ", ".join(unknown)))
    if plan.group_by or plan.aggregations:
        issues.append(_issue("d_execution_summary_forbidden", "D执行切片只允许人员明细，不允许汇总或分组"))
    if len(set(plan.output_fields)) != len(plan.output_fields):
        issues.append(_issue("d_execution_duplicate_output", "执行计划输出字段不可重复"))

    if issues:
        return _blocked(bound_request, issues)
    return DExecutionValidationOut(
        dataset_id=bound_request.dataset_id,
        contract_id=bound_request.contract_id,
        contract_version=bound_request.contract_version,
        shape="detail",
        detail_path="person_scope",
        eligible=True,
        runtime_enabled=False,
        output_fields=list(plan.output_fields),
        filters=list(plan.filters),
        order_by=list(plan.order_by),
        issues=[],
    )
