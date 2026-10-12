from contextlib import asynccontextmanager
from datetime import UTC, datetime
from typing import Literal

from fastapi import HTTPException
from pydantic import BaseModel, Field, field_validator, model_validator
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
    return dataset, tables, (await db.execute(select(DataSetRelation).where(DataSetRelation.dataset_id == dataset_id))).scalars().all(), outputs


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
        await _validate_definition(db, dataset_id, current)
        if any(f.role != "person_fact" or f.allow_cost_center_summary or f.cost_center_key for f in current.facts):
            raise HTTPException(409, detail={"code": "contract_execution_validation_required", "message": "成本中心、参考或桥接路径尚未完成树/基数/最小投影验证"})
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


async def execution_readiness(db, dataset_id):
    from app.datasets.models import DataSetAcl
    dataset = await db.get(DataSet, dataset_id)
    if dataset is None:
        raise HTTPException(404, detail={"code": "dataset_not_found", "message": "数据集不存在"})
    row = (await db.execute(select(DataProductAuthorizationContract).where(
        DataProductAuthorizationContract.dataset_id == dataset_id,
        DataProductAuthorizationContract.status == "active",
    ).order_by(DataProductAuthorizationContract.contract_version.desc()).limit(1))).scalar_one_or_none()
    issues: list[dict[str, str]] = []
    paths: list[AuthorizationPathOut] = []
    if row is None:
        issues.append({"code": "authorization_contract_missing", "message": "缺少active授权合同"})
        return AuthorizationExecutionReadinessOut(
            dataset_id=dataset_id, contract_id=None, contract_version=None, eligible=False,
            paths=[], issues=issues, checked_areas=["contract_presence"],
            unchecked_areas=["tree", "cardinality", "sql_compiler", "field_execution"],
        )
    definition = ProductAuthorizationDefinition.model_validate(row.contract_json)
    tables = (await db.execute(select(DataSetTable).where(DataSetTable.dataset_id == dataset_id))).scalars().all()
    aliases = {table.alias: table.table_name for table in tables}
    snapshot = row.model_snapshot or {}
    if {table.id for table in tables} != {item.get("id") for item in snapshot.get("tables", [])}:
        issues.append({"code": "authorization_contract_drift", "message": "来源表结构已偏离批准快照"})
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
    try:
        acl_count = await db.scalar(select(DataSetAcl.id).where(DataSetAcl.dataset_id == dataset_id).limit(1))
    except Exception as error:
        if "does not exist" in str(error):
            acl_count = None
            issues.append({"code": "dataset_acl_unavailable", "message": "ACL表不可用，执行授权检查保持阻断"})
        else:
            raise
    if acl_count is None and dataset.created_by is None:
        issues.append({"code": "dataset_acl_unresolved", "message": "数据集没有ACL且没有创建人，不能确定消费主体"})
    issues.extend([
        {"code": "tree_validation_required", "message": "组织/成本中心树、后代展开和孤儿处理尚未接入执行编译器"},
        {"code": "sql_compiler_not_integrated", "message": "D/S计划尚未接入现有查询执行器"},
    ])
    return AuthorizationExecutionReadinessOut(
        dataset_id=dataset_id, contract_id=row.id, contract_version=row.contract_version,
        eligible=False, paths=paths, issues=issues,
        checked_areas=["contract_snapshot", "fact_roles", "acl_presence"],
        unchecked_areas=["tree", "cardinality", "sql_compiler", "field_execution", "external_exports"],
    )
