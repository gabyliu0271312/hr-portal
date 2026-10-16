"""最小安全 D 执行合同校验。

本模块只负责无副作用的合同/计划绑定校验，不执行 SQL，也不接入报表运行链路。
当前切片仅允许单一 person_fact、无 JOIN、无成本中心汇总、无 reference/bridge。
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Mapping

from pydantic import BaseModel, Field, ValidationError
from sqlalchemy import String, cast, select
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
