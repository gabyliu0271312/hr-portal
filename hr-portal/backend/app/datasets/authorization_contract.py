from contextlib import asynccontextmanager
from datetime import UTC, datetime
from typing import Literal

from fastapi import HTTPException
from pydantic import BaseModel, Field, ValidationError, field_validator, model_validator
from sqlalchemy import select, text

from app.data.models import TableColumn
from app.datasets.models import (
    DataSet,
    DataSetRelation,
    DataSetTable,
    DatasetOutputField,
    DataProductAuthorizationContract,
)
from app.system.models import SystemLog
from app.warehouse.service.standardization import _normalized_metadata_type, _physical_metadata_type


@asynccontextmanager
async def _contract_transaction(db):
    try:
        yield
        await db.commit()
    except Exception:
        await db.rollback()
        raise


class ProductFactContract(BaseModel):
    model_config = {"extra": "forbid"}
    alias: str = Field(pattern=r"^[A-Za-z_][A-Za-z0-9_]{0,63}$")
    table_name: str = Field(min_length=1, max_length=64)
    fact_key: str = Field(min_length=1, max_length=128)
    employee_key: str | None = Field(default=None, min_length=1, max_length=128)
    cost_center_key: str | None = Field(default=None, min_length=1, max_length=128)
    allow_cost_center_summary: bool = Field(default=False, strict=True)
    missing_assignment: Literal["reject", "unknown_bucket"] = "reject"
    role: Literal["person_fact", "allocation_fact", "reference", "bridge"] = "person_fact"

    @model_validator(mode="after")
    def validate_path(self):
        if self.allow_cost_center_summary and (not self.cost_center_key or self.role != "allocation_fact"):
            raise ValueError("成本中心汇总仅供声明中心键的分摊事实")
        if self.role in {"person_fact", "allocation_fact"} and not self.employee_key:
            raise ValueError("事实必须声明人员键")
        return self


class ProductAuthorizationDefinition(BaseModel):
    model_config = {"extra": "forbid"}
    facts: list[ProductFactContract] = Field(min_length=1, max_length=32)
    output_fields: list[str] = Field(min_length=1, max_length=500)
    dimensions: list[str] = Field(default_factory=list, max_length=200)
    measures: list[str] = Field(default_factory=list, max_length=200)
    internal_fields: list[str] = Field(default_factory=list, max_length=200)

    @field_validator("output_fields", "dimensions", "measures", "internal_fields")
    @classmethod
    def validate_fields(cls, values):
        if len(values) != len(set(values)) or any(not value.strip() for value in values):
            raise ValueError("字段必须非空且不重复")
        return values

    @model_validator(mode="after")
    def validate_structure(self):
        if len({fact.alias for fact in self.facts}) != len(self.facts):
            raise ValueError("来源别名不可重复")
        if (set(self.dimensions) | set(self.measures)) - set(self.output_fields):
            raise ValueError("维度和度量须在输出白名单中")
        if set(self.dimensions) & set(self.measures):
            raise ValueError("维度和度量不得重叠")
        return self


class ProductAuthorizationCreateIn(ProductAuthorizationDefinition):
    expected_version: int = Field(ge=0, strict=True)


class ProductAuthorizationUpdateIn(ProductAuthorizationDefinition):
    expected_revision: int = Field(ge=0, strict=True)


class ProductAuthorizationActionIn(BaseModel):
    model_config = {"extra": "forbid"}
    expected_revision: int = Field(ge=0, strict=True)
    reason: str = Field(min_length=1, max_length=1000)

    @field_validator("reason")
    @classmethod
    def normalize_reason(cls, value):
        value = value.strip()
        if not value:
            raise ValueError("原因不能为空")
        return value


class ProductAuthorizationOut(ProductAuthorizationDefinition):
    id: int
    dataset_id: int
    contract_version: int
    revision: int
    status: Literal["draft", "active", "retired"]
    approved_by: int | None
    approved_at: datetime | None
    approval_reason: str | None
    created_by: int
    runtime_enabled: Literal[False] = False


def _snapshot(tables, relations, outputs):
    return {
        "tables": [{"id": row.id, "table_name": row.table_name, "alias": row.alias} for row in tables],
        "relations": [{"id": row.id, "left_alias": row.left_alias, "right_alias": row.right_alias,
                       "join_type": row.join_type, "cardinality": row.cardinality, "keys": row.keys} for row in relations],
        "outputs": [{"id": row.id, "source_alias": row.source_alias, "source_column": row.source_column,
                     "output_code": row.output_code, "data_type": row.data_type, "is_sensitive": row.is_sensitive,
                     "is_visible": row.is_visible} for row in outputs],
    }


def _validate_relation_metadata(relations, aliases: set[str]) -> list[dict[str, str]]:
    issues: list[dict[str, str]] = []
    valid_join_types = {"inner", "left", "right", "full"}
    valid_cardinalities = {"1:1", "1:N", "N:1"}
    for relation in relations:
        if relation.left_alias not in aliases or relation.right_alias not in aliases:
            issues.append({"code": "authorization_relation_alias_invalid", "message": "关联别名不在数据集来源表中"})
        if relation.left_alias == relation.right_alias:
            issues.append({"code": "authorization_relation_self_join", "message": "授权合同不允许未声明的自关联"})
        if relation.join_type not in valid_join_types:
            issues.append({"code": "authorization_relation_join_type_invalid", "message": "关联类型未通过授权合同校验"})
        if relation.cardinality not in valid_cardinalities:
            issues.append({"code": "authorization_relation_cardinality_invalid", "message": "关联基数未通过授权合同校验"})
        if not isinstance(relation.keys, list) or not relation.keys:
            issues.append({"code": "authorization_relation_keys_missing", "message": "关联缺少受控连接键"})
            continue
        for key in relation.keys:
            if not isinstance(key, dict) or not key.get("left") or not key.get("right"):
                issues.append({"code": "authorization_relation_key_invalid", "message": "关联连接键未通过授权合同校验"})
    return issues


def _snapshot_drift(snapshot, tables, relations, outputs) -> bool:
    current = _snapshot(tables, relations, outputs)
    for key in ("tables", "relations", "outputs"):
        items = snapshot.get(key)
        if not isinstance(items, list) or any(not isinstance(item, dict) or item.get("id") is None for item in items):
            return True
        expected = {item["id"]: item for item in items}
        actual = {item["id"]: item for item in current[key]}
        if len(expected) != len(items) or expected != actual:
            return True
    return False


def _physical_type_name(value: str) -> str | None:
    if value in {"bigint", "integer", "smallint", "numeric", "double precision", "real"}:
        return "number"
    if value == "date":
        return "date"
    if value in {"timestamp with time zone", "timestamp without time zone"}:
        return "datetime"
    if value == "boolean":
        return "bool"
    if value in {"text", "character varying", "character", "json", "jsonb"}:
        return "string"
    return None


async def _collect_contract_physical_drift(db, definition, tables, relations, outputs) -> list[dict[str, str]]:
    issues: list[dict[str, str]] = []
    aliases = {table.alias: table.table_name for table in tables}
    table_columns: dict[str, dict[str, TableColumn]] = {}
    physical_columns: dict[str, dict[str, tuple[str, str | None]]] = {}
    required: dict[str, set[str]] = {name: set() for name in set(aliases.values())}
    for fact in definition.facts:
        if fact.alias in aliases:
            required[aliases[fact.alias]].update({fact.fact_key, fact.employee_key, fact.cost_center_key} - {None})
    for output in outputs:
        if output.source_alias in aliases:
            required[aliases[output.source_alias]].add(output.source_column)
    for field in definition.internal_fields:
        if "." in field:
            alias, column = field.split(".", 1)
            if alias in aliases:
                required[aliases[alias]].add(column)
    for relation in relations:
        for key in relation.keys or []:
            if isinstance(key, dict):
                for alias, side in ((relation.left_alias, "left"), (relation.right_alias, "right")):
                    if alias in aliases and isinstance(key.get(side), str):
                        required[aliases[alias]].add(key[side])
    for table_name in set(aliases.values()):
        rows = (await db.execute(select(TableColumn).where(TableColumn.table_name == table_name))).scalars().all()
        table_columns[table_name] = {row.column_code: row for row in rows}
        physical = (await db.execute(text(
            "SELECT column_name, data_type FROM information_schema.columns "
            "WHERE table_schema=current_schema() AND table_name=:table_name"
        ), {"table_name": table_name})).all()
        physical_columns[table_name] = {
            column: (raw_type, _physical_type_name(raw_type)) for column, raw_type in physical
        }
        if any(physical_columns[table_name].get(column, (None, None))[1] is None
               for column in required[table_name] if column in physical_columns[table_name]):
            issues.append({"code": "authorization_physical_type_unknown", "message": "合同引用字段存在未支持的物理类型"})

    def check_column(alias: str, column: str, prefix: str) -> None:
        table_name = aliases.get(alias)
        if not table_name:
            issues.append({"code": f"{prefix}_source_alias_invalid", "message": "合同字段来源别名无效"})
            return
        metadata = table_columns.get(table_name, {}).get(column)
        physical = physical_columns.get(table_name, {}).get(column)
        if metadata is None or physical is None:
            issues.append({"code": f"{prefix}_column_missing", "message": "合同引用字段不存在"})
            return
        if physical[1] is None:
            return
        if _normalized_metadata_type(metadata.data_type) != physical[1]:
            issues.append({"code": f"{prefix}_metadata_type_drift", "message": "合同引用字段元数据类型与物理类型不一致"})

    for fact in definition.facts:
        for column in {fact.fact_key, fact.employee_key, fact.cost_center_key} - {None}:
            check_column(fact.alias, column, "authorization_fact")
    for output in outputs:
        check_column(output.source_alias, output.source_column, "authorization_output")
        table_name = aliases.get(output.source_alias)
        physical = physical_columns.get(table_name or "", {}).get(output.source_column)
        if physical and physical[1] is not None and _normalized_metadata_type(output.data_type) != physical[1]:
            issues.append({"code": "authorization_output_physical_type_drift", "message": "合同输出字段类型与物理类型不一致"})
    for field in definition.internal_fields:
        if "." not in field or field.count(".") != 1:
            issues.append({"code": "authorization_internal_field_invalid", "message": "合同内部字段格式无效"})
            continue
        alias, column = field.split(".", 1)
        check_column(alias, column, "authorization_internal")
    for relation in relations:
        for key in relation.keys or []:
            left = key.get("left") if isinstance(key, dict) else None
            right = key.get("right") if isinstance(key, dict) else None
            if left and right:
                check_column(relation.left_alias, left, "authorization_relation")
                check_column(relation.right_alias, right, "authorization_relation")
    return issues


async def _validate_definition(db, dataset_id, payload):
    dataset = await db.get(DataSet, dataset_id)
    if dataset is None:
        raise HTTPException(404, detail={"code": "dataset_not_found", "message": "数据集不存在"})
    tables = (await db.execute(select(DataSetTable).where(DataSetTable.dataset_id == dataset_id))).scalars().all()
    aliases = {row.alias: row.table_name for row in tables}
    outputs = (await db.execute(select(DatasetOutputField).where(DatasetOutputField.dataset_id == dataset_id))).scalars().all()
    output_codes = {row.output_code for row in outputs}
    for code in [*payload.output_fields, *payload.dimensions, *payload.measures]:
        if code not in output_codes:
            raise HTTPException(400, detail={"code": "contract_field_not_in_output", "message": f"字段不属于数据集输出白名单: {code}"})
    for fact in payload.facts:
        if aliases.get(fact.alias) != fact.table_name:
            raise HTTPException(400, detail={"code": "contract_fact_table_mismatch", "message": f"事实别名未映射到声明表: {fact.alias}"})
        columns = set((await db.execute(select(TableColumn.column_code).where(TableColumn.table_name == fact.table_name))).scalars().all())
        required = {fact.fact_key} | ({fact.employee_key} if fact.employee_key else set()) | ({fact.cost_center_key} if fact.cost_center_key else set())
        missing = sorted(required - columns)
        if missing:
            raise HTTPException(400, detail={"code": "contract_fact_key_missing", "message": f"事实键缺少元数据: {', '.join(missing)}"})
        physical = (await db.execute(text("SELECT column_name,data_type FROM information_schema.columns WHERE table_schema=current_schema() AND table_name=:table_name"), {"table_name": fact.table_name})).all()
        physical_types = {code: _physical_metadata_type(kind) for code, kind in physical}
        for code in required:
            column = (await db.execute(select(TableColumn).where(TableColumn.table_name == fact.table_name, TableColumn.column_code == code))).scalar_one()
            if code not in physical_types or _normalized_metadata_type(column.data_type) != physical_types[code]:
                raise HTTPException(400, detail={"code": "contract_fact_type_drift", "message": f"事实键类型与物理结构不一致: {fact.alias}.{code}"})
    relations = (await db.execute(select(DataSetRelation).where(DataSetRelation.dataset_id == dataset_id))).scalars().all()
    relation_issues = _validate_relation_metadata(relations, set(aliases))
    if relation_issues:
        raise HTTPException(400, detail=relation_issues[0])
    return dataset, tables, relations, outputs


def _out(row):
    return ProductAuthorizationOut(dataset_id=row.dataset_id, id=row.id, contract_version=row.contract_version,
        revision=row.revision, status=row.status, approved_by=row.approved_by, approved_at=row.approved_at,
        approval_reason=row.approval_reason, created_by=row.created_by, **row.contract_json)


def _audit(db, action, row, user, reason_supplied=False):
    db.add(SystemLog(category="scope_governance", action="authorization_contract_" + action, status="success",
        user_id=user.id, request_summary="维护数据产品授权合同", response_summary="仅合同元数据变更，运行时权限开关保持关闭",
        metadata_json={"dataset_id": row.dataset_id, "contract_id": row.id, "contract_version": row.contract_version,
                       "revision": row.revision, "status": row.status, "runtime_enabled": False,
                       "reason_supplied": reason_supplied}))


async def list_contracts(db, dataset_id):
    if await db.get(DataSet, dataset_id) is None:
        raise HTTPException(404, detail={"code": "dataset_not_found", "message": "数据集不存在"})
    rows = (await db.execute(select(DataProductAuthorizationContract).where(DataProductAuthorizationContract.dataset_id == dataset_id).order_by(DataProductAuthorizationContract.contract_version.desc()))).scalars().all()
    return [_out(row) for row in rows]


async def create_contract(db, dataset_id, payload, user):
    dataset, tables, relations, outputs = await _validate_definition(db, dataset_id, payload)
    latest = await db.scalar(select(DataProductAuthorizationContract.contract_version).where(DataProductAuthorizationContract.dataset_id == dataset_id).order_by(DataProductAuthorizationContract.contract_version.desc()).limit(1)) or 0
    if latest != payload.expected_version:
        raise HTTPException(409, detail={"code": "contract_version_conflict", "message": "合同版本已变化"})
    draft = await db.scalar(select(DataProductAuthorizationContract.id).where(DataProductAuthorizationContract.dataset_id == dataset_id, DataProductAuthorizationContract.status == "draft"))
    if draft:
        raise HTTPException(409, detail={"code": "contract_draft_exists", "message": "已有授权合同草稿"})
    async with _contract_transaction(db):
        row = DataProductAuthorizationContract(dataset_id=dataset_id, contract_version=latest + 1, revision=0,
            status="draft", contract_json=payload.model_dump(exclude={"expected_version"}),
            model_snapshot=_snapshot(tables, relations, outputs), created_by=user.id)
        db.add(row)
        await db.flush()
        _audit(db, "created", row, user)
        return _out(row)


async def update_contract(db, dataset_id, contract_id, payload, user):
    dataset, tables, relations, outputs = await _validate_definition(db, dataset_id, payload)
    async with _contract_transaction(db):
        row = (await db.execute(select(DataProductAuthorizationContract).where(DataProductAuthorizationContract.id == contract_id, DataProductAuthorizationContract.dataset_id == dataset_id).with_for_update())).scalar_one_or_none()
        if row is None:
            raise HTTPException(404, detail={"code": "contract_not_found", "message": "授权合同不存在"})
        if row.status != "draft":
            raise HTTPException(409, detail={"code": "contract_readonly", "message": "批准合同不可覆盖"})
        if row.revision != payload.expected_revision:
            raise HTTPException(409, detail={"code": "contract_revision_conflict", "message": "合同版本已变化"})
        row.contract_json = payload.model_dump(exclude={"expected_revision"})
        row.model_snapshot = _snapshot(tables, relations, outputs)
        row.revision += 1
        row.updated_at = datetime.now(UTC)
        await db.flush()
        _audit(db, "updated", row, user)
        return _out(row)


async def approve_contract(db, dataset_id, contract_id, payload, user):
    async with _contract_transaction(db):
        row = (await db.execute(select(DataProductAuthorizationContract).where(DataProductAuthorizationContract.id == contract_id, DataProductAuthorizationContract.dataset_id == dataset_id).with_for_update())).scalar_one_or_none()
        if row is None:
            raise HTTPException(404, detail={"code": "contract_not_found", "message": "授权合同不存在"})
        if row.status != "draft" or row.revision != payload.expected_revision:
            raise HTTPException(409, detail={"code": "contract_transition_conflict", "message": "草稿状态或版本已变化"})
        current = ProductAuthorizationDefinition.model_validate(row.contract_json)
        _, tables, relations, outputs = await _validate_definition(db, dataset_id, current)
        if (len(current.facts) != 1 or relations
                or any(f.role != "person_fact" or f.allow_cost_center_summary or f.cost_center_key for f in current.facts)):
            raise HTTPException(409, detail={"code": "contract_execution_validation_required", "message": "当前执行切片仅允许单一person_fact且不含JOIN或成本中心汇总路径"})
        physical_issues = await _collect_contract_physical_drift(db, current, tables, relations, outputs)
        if physical_issues:
            raise HTTPException(409, detail={"code": "contract_physical_validation_failed", "message": "授权合同引用的字段物理结构未通过校验"})
        row.status = "active"
        row.approved_by = user.id
        row.approved_at = datetime.now(UTC)
        row.approval_reason = payload.reason
        row.revision += 1
        await db.flush()
        _audit(db, "approved", row, user, True)
        return _out(row)

async def retire_contract(db, dataset_id, contract_id, payload, user):
    async with _contract_transaction(db):
        row = (await db.execute(select(DataProductAuthorizationContract).where(
            DataProductAuthorizationContract.id == contract_id,
            DataProductAuthorizationContract.dataset_id == dataset_id,
        ).with_for_update())).scalar_one_or_none()
        if row is None:
            raise HTTPException(404, detail={"code": "contract_not_found", "message": "授权合同不存在"})
        if row.status != "active" or row.revision != payload.expected_revision:
            raise HTTPException(409, detail={"code": "contract_transition_conflict", "message": "只有当前active合同可以退休"})
        row.status = "retired"
        row.approved_by = user.id
        row.approved_at = datetime.now(UTC)
        row.approval_reason = payload.reason
        row.revision += 1
        await db.flush()
        _audit(db, "retired", row, user, True)
        return _out(row)


class AuthorizationPathOut(BaseModel):
    alias: str
    role: str
    detail_mode: Literal["person_scope", "not_allowed"]
    summary_mode: Literal["person_scope", "person_or_cost_center_scope", "not_allowed"]
    employee_key: str | None
    cost_center_key: str | None


class AuthorizationExecutionReadinessOut(BaseModel):
    dataset_id: int
    contract_id: int | None
    contract_version: int | None
    runtime_enabled: Literal[False] = False
    eligible: bool
    paths: list[AuthorizationPathOut]
    issues: list[dict[str, str]]
    checked_areas: list[str]
    unchecked_areas: list[str]


async def execution_readiness(db, dataset_id, user=None):
    from app.datasets.router import _can_access
    dataset = await db.get(DataSet, dataset_id)
    if dataset is None:
        raise HTTPException(404, detail={"code": "dataset_not_found", "message": "数据集不存在"})
    if user is None:
        return AuthorizationExecutionReadinessOut(
            dataset_id=dataset_id, contract_id=None, contract_version=None, eligible=False,
            paths=[], issues=[{"code": "acl_subject_unresolved", "message": "未提供当前用户，不能解析数据集访问主体"}],
            checked_areas=["dataset_acl"],
            unchecked_areas=["contract_presence", "tree", "cardinality", "sql_compiler", "field_execution"],
        )
    if not await _can_access(user, dataset, db):
        return AuthorizationExecutionReadinessOut(
            dataset_id=dataset_id, contract_id=None, contract_version=None, eligible=False,
            paths=[], issues=[{"code": "dataset_acl_denied", "message": "当前用户不具备数据集资源访问权"}],
            checked_areas=["dataset_acl"],
            unchecked_areas=["contract_presence", "tree", "cardinality", "sql_compiler", "field_execution"],
        )
    issues: list[dict[str, str]] = []
    if dataset.is_active is not True:
        issues.append({"code": "dataset_inactive", "message": "数据集当前不可用于授权执行"})
    rows = (await db.execute(select(DataProductAuthorizationContract).where(
        DataProductAuthorizationContract.dataset_id == dataset_id,
        DataProductAuthorizationContract.status == "active",
    ).order_by(DataProductAuthorizationContract.contract_version.desc()).limit(2))).scalars().all()
    paths: list[AuthorizationPathOut] = []
    if len(rows) > 1:
        return AuthorizationExecutionReadinessOut(
            dataset_id=dataset_id, contract_id=None, contract_version=None, eligible=False,
            paths=[], issues=[*issues, {"code": "authorization_contract_ambiguous", "message": "当前数据集存在多个active授权合同"}],
            checked_areas=["dataset_acl", "contract_presence"],
            unchecked_areas=["tree", "cardinality", "sql_compiler", "field_execution"],
        )
    row = rows[0] if rows else None
    if row is None:
        issues.append({"code": "authorization_contract_missing", "message": "缺少active授权合同"})
        return AuthorizationExecutionReadinessOut(
            dataset_id=dataset_id, contract_id=None, contract_version=None, eligible=False,
            paths=[], issues=issues, checked_areas=["dataset_acl", "contract_presence"],
            unchecked_areas=["tree", "cardinality", "sql_compiler", "field_execution"],
        )
    try:
        definition = ProductAuthorizationDefinition.model_validate(row.contract_json)
    except (TypeError, ValueError, ValidationError):
        return AuthorizationExecutionReadinessOut(
            dataset_id=dataset_id, contract_id=row.id, contract_version=row.contract_version, eligible=False,
            paths=[], issues=[*issues, {"code": "authorization_contract_invalid", "message": "active授权合同定义无效"}],
            checked_areas=["dataset_acl", "contract_presence"],
            unchecked_areas=["contract_snapshot", "tree", "cardinality", "sql_compiler", "field_execution"],
        )
    tables = (await db.execute(select(DataSetTable).where(DataSetTable.dataset_id == dataset_id))).scalars().all()
    relations = (await db.execute(select(DataSetRelation).where(DataSetRelation.dataset_id == dataset_id))).scalars().all()
    aliases = {table.alias: table.table_name for table in tables}
    snapshot = row.model_snapshot
    if not isinstance(snapshot, dict):
        return AuthorizationExecutionReadinessOut(
            dataset_id=dataset_id, contract_id=row.id, contract_version=row.contract_version, eligible=False,
            paths=[], issues=[*issues, {"code": "authorization_snapshot_invalid", "message": "active授权合同快照无效"}],
            checked_areas=["dataset_acl", "contract_presence"],
            unchecked_areas=["contract_snapshot", "tree", "cardinality", "sql_compiler", "field_execution"],
        )
    if _snapshot_drift(snapshot, tables, relations, (await db.execute(select(DatasetOutputField).where(DatasetOutputField.dataset_id == dataset_id))).scalars().all()):
        issues.append({"code": "authorization_contract_drift", "message": "数据集来源、关联或输出结构已偏离批准快照"})
    issues.extend(_validate_relation_metadata(relations, set(aliases)))
    issues.extend(await _collect_contract_physical_drift(db, definition, tables, relations, (await db.execute(select(DatasetOutputField).where(DatasetOutputField.dataset_id == dataset_id))).scalars().all()))
    tree_models = []
    if any(fact.allow_cost_center_summary for fact in definition.facts):
        from app.data.models import CostCenterNode
        tree_models.append(("cost_center", CostCenterNode))
    from app.data.models import OrgNode
    tree_models.append(("org", OrgNode))
    for kind, model in tree_models:
        from app.warehouse.service.tree_health import analyze_tree
        tree = analyze_tree(kind, (await db.execute(select(model).order_by(model.id))).scalars().all())
        if not tree.eligible:
            issues.append({"code": f"authorization_{kind}_tree_unhealthy", "message": "授权依赖的权限树健康检查未通过"})
    for fact in definition.facts:
        if aliases.get(fact.alias) != fact.table_name:
            issues.append({"code": "fact_alias_drift", "message": f"事实别名未映射到批准表: {fact.alias}"})
        if fact.role in {"reference", "bridge"}:
            issues.append({"code": "reference_path_not_compiled", "message": f"参考/桥接路径尚未完成最小投影编译: {fact.alias}"})
        if fact.role in {"person_fact", "allocation_fact"} and not fact.employee_key:
            issues.append({"code": "employee_path_missing", "message": f"事实缺少人员键: {fact.alias}"})
        if fact.allow_cost_center_summary and (fact.role != "allocation_fact" or not fact.cost_center_key):
            issues.append({"code": "cost_center_path_invalid", "message": f"成本中心汇总路径无效: {fact.alias}"})
        paths.append(AuthorizationPathOut(
            alias=fact.alias, role=fact.role,
            detail_mode="person_scope" if fact.role in {"person_fact", "allocation_fact"} else "not_allowed",
            summary_mode=("person_or_cost_center_scope" if fact.allow_cost_center_summary else
                          "person_scope" if fact.role in {"person_fact", "allocation_fact"} else "not_allowed"),
            employee_key=fact.employee_key, cost_center_key=fact.cost_center_key,
        ))
    issues.extend([
        {"code": "tree_validation_required", "message": "权限树授权节点展开尚未接入执行编译器"},
        {"code": "sql_compiler_not_integrated", "message": "D/S计划尚未接入现有查询执行器"},
    ])
    return AuthorizationExecutionReadinessOut(
        dataset_id=dataset_id, contract_id=row.id, contract_version=row.contract_version,
        eligible=False, paths=paths, issues=issues,
        checked_areas=["contract_snapshot", "fact_roles", "current_user_acl", "contract_physical_schema", "tree_health"],
        unchecked_areas=["tree_scope_expansion", "cardinality", "sql_compiler", "field_execution", "external_exports"],
    )
