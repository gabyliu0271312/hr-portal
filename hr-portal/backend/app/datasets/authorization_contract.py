from contextlib import asynccontextmanager
from datetime import UTC, datetime
from typing import Literal

from fastapi import HTTPException
from pydantic import BaseModel, Field, ValidationError, field_validator, model_validator
from sqlalchemy import select, text

from app.data.models import (
    StandardField,
    StandardFieldBinding,
    TableColumn,
)
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
    allow_employee_count: bool = Field(default=False, strict=True)
    missing_assignment: Literal["reject", "unknown_bucket"] = "reject"
    role: Literal["person_fact", "allocation_fact", "reference", "bridge"] = "person_fact"

    @model_validator(mode="after")
    def validate_path(self):
        if self.allow_cost_center_summary and (not self.cost_center_key or self.role != "allocation_fact"):
            raise ValueError("成本中心汇总仅供声明中心键的分摊事实")
        if self.role in {"person_fact", "allocation_fact"} and not self.employee_key:
            raise ValueError("事实必须声明人员键")
        if self.allow_employee_count and (self.role not in {"person_fact", "allocation_fact"} or not self.employee_key):
            raise ValueError("人数指标必须绑定含人员键的事实")
        return self


SUPPORTED_FILTER_OPERATORS = ("eq", "in", "gte", "lte", "between")


def _item(source, key):
    return source.get(key) if isinstance(source, dict) else getattr(source, key, None)


def derived_summary_fields(definition, outputs) -> dict:
    """schema 3：从数据集输出与事实锚点推导可汇总字段、维度、度量与识别字段。

    outputs 支持 ORM 对象或 dict（需含 output_code / source_column / agg_role）。
    """
    # 人员/事实键属于识别字段；成本中心键是批准的汇总分组维度，不属于识别字段
    anchors = {(fact.alias, key) for fact in definition.facts
               for key in (fact.fact_key, fact.employee_key) if key}
    all_codes = [_item(output, "output_code") for output in outputs]
    identifying = {_item(output, "output_code") for output in outputs
                   if (_item(output, "source_alias"), _item(output, "source_column")) in anchors
                   or (len(definition.facts) == 1 and _item(output, "source_alias") is None
                       and _item(output, "source_column") in {key for _, key in anchors})}
    summary = [output for output in outputs if _item(output, "output_code") not in identifying]
    dimensions = [_item(output, "output_code") for output in summary
                  if (_item(output, "agg_role") or "dimension") != "measure"]
    measures = [_item(output, "output_code") for output in summary
                if (_item(output, "agg_role") or "dimension") == "measure"]
    return {
        "all_outputs": all_codes,
        "identifying": identifying,
        "summary_outputs": [_item(output, "output_code") for output in summary],
        "dimensions": dimensions,
        "measures": measures,
    }


def approved_filter_map(definition, outputs) -> dict[str, set[str]]:
    """schema 3 由可分组维度推导可筛选字段；schema 1/2 仍读合同声明。"""
    if definition.schema_version == 3:
        derived = derived_summary_fields(definition, outputs)
        return {code: set(SUPPORTED_FILTER_OPERATORS) for code in derived["dimensions"]}
    return {item.field: set(item.operators) for item in definition.approved_filters}


def personal_filter_map(definition, outputs) -> dict[str, set[str]]:
    """schema 3 人员定位筛选仅供明细D；汇总S不接受 identifying 条件。"""
    if definition.schema_version != 3:
        return {}
    derived = derived_summary_fields(definition, outputs)
    return {code: set(SUPPORTED_FILTER_OPERATORS) for code in derived["identifying"]}


def detail_filter_map(definition, outputs) -> dict[str, set[str]]:
    """schema 3 明细/下钻条件：维度与人员定位字段，排除度量和技术字段。"""
    if definition.schema_version != 3:
        return {}
    derived = derived_summary_fields(definition, outputs)
    allowed = set(derived["dimensions"]) | set(derived["identifying"])
    return {code: set(SUPPORTED_FILTER_OPERATORS) for code in allowed}


class ApprovedFilter(BaseModel):
    """合同批准的筛选能力：只允许在已批准维度上按批准操作符收窄。"""
    model_config = {"extra": "forbid"}
    field: str = Field(min_length=1, max_length=128)
    operators: list[Literal["eq", "in", "gte", "lte", "between"]] = Field(
        default_factory=lambda: ["eq"], min_length=1, max_length=5
    )

    @field_validator("operators")
    @classmethod
    def validate_operators(cls, values):
        if len(values) != len(set(values)):
            raise ValueError("筛选操作符不可重复")
        return values


class ProductAuthorizationDefinition(BaseModel):
    model_config = {"extra": "forbid"}
    schema_version: Literal[1, 2, 3] = 1
    facts: list[ProductFactContract] = Field(min_length=1, max_length=32)
    # schema 1: 数据集输出编码；schema 2 输入: 标准字段编码，落库前由服务端解析为输出编码。
    output_fields: list[str] = Field(default_factory=list, max_length=500)
    dimensions: list[str] = Field(default_factory=list, max_length=200)
    measures: list[str] = Field(default_factory=list, max_length=200)
    internal_fields: list[str] = Field(default_factory=list, max_length=200)
    # 明细输出白名单；与 S 的 output_fields 独立，二者并集须覆盖数据集全部输出。
    detail_output_fields: list[str] = Field(default_factory=list, max_length=200)
    standard_fields: list[str] = Field(default_factory=list, max_length=500)
    resolved_standard_fields: dict[str, dict] = Field(default_factory=dict)
    # 合同批准的筛选能力；为空表示该产品暂不开放业务筛选（authorized_v1 拒绝任何筛选）。
    approved_filters: list[ApprovedFilter] = Field(default_factory=list, max_length=50)

    @field_validator("output_fields", "dimensions", "measures", "internal_fields",
                     "detail_output_fields", "standard_fields")
    @classmethod
    def validate_fields(cls, values):
        if len(values) != len(set(values)) or any(not value.strip() for value in values):
            raise ValueError("字段必须非空且不重复")
        return values

    @model_validator(mode="after")
    def validate_structure(self):
        if len({fact.alias for fact in self.facts}) != len(self.facts):
            raise ValueError("来源别名不可重复")
        if self.schema_version == 3:
            # schema 3：合同只声明事实与路径；字段白名单/维度/度量/筛选能力全部由
            # 数据集输出、标准字段语义与查询形态推导，合同里出现这些声明即视为无效。
            declared = {
                "output_fields": self.output_fields,
                "dimensions": self.dimensions,
                "measures": self.measures,
                "detail_output_fields": self.detail_output_fields,
                "internal_fields": self.internal_fields,
                "standard_fields": self.standard_fields,
                "approved_filters": self.approved_filters,
            }
            extra = [name for name, value in declared.items() if value]
            if extra:
                raise ValueError(f"schema 3 合同不接受字段白名单声明: {', '.join(extra)}")
            if set(self.dimensions) & set(self.measures):
                raise ValueError("维度和度量不得重叠")
            return self
        normalized = self.schema_version == 2 and bool(self.resolved_standard_fields)
        if self.schema_version == 2 and not normalized:
            if not self.standard_fields:
                raise ValueError("schema 2 合同必须声明 standard_fields")
            if not self.output_fields:
                raise ValueError("schema 2 合同必须声明要暴露的标准字段")
            if (set(self.dimensions) | set(self.measures)) - set(self.standard_fields):
                raise ValueError("维度和度量须在标准字段白名单中")
            if (set(self.output_fields) | set(self.internal_fields) | set(self.detail_output_fields)) - set(self.standard_fields):
                raise ValueError("输出、明细输出和内部字段须在标准字段白名单中")
            anchor_codes = {fact.employee_key for fact in self.facts if fact.employee_key}
            anchor_codes |= {fact.cost_center_key for fact in self.facts if fact.cost_center_key}
            if anchor_codes - set(self.standard_fields):
                raise ValueError("授权锚点须在标准字段白名单中")
        else:
            if not self.output_fields:
                raise ValueError("字段必须非空且不重复")
            if (set(self.dimensions) | set(self.measures)) - set(self.output_fields):
                raise ValueError("维度和度量须在输出白名单中")
        if set(self.dimensions) & set(self.measures):
            raise ValueError("维度和度量不得重叠")
        if self.approved_filters:
            if len({item.field for item in self.approved_filters}) != len(self.approved_filters):
                raise ValueError("筛选字段不可重复")
            for item in self.approved_filters:
                # 只允许在批准维度上筛选：度量/人员定位字段一律不可作为筛选条件
                if item.field not in self.dimensions:
                    raise ValueError(f"筛选字段 {item.field} 必须是合同批准的维度")
                if item.field in self.internal_fields and item.field not in self.output_fields:
                    raise ValueError(f"内部字段 {item.field} 不可作为筛选条件")
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
                     "agg_role": getattr(row, "agg_role", None) or "dimension"} for row in outputs],
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


async def _validate_relation_cardinality_constraints(db, tables, relations):
    aliases = {table.alias: table.table_name for table in tables}
    unique_by_table = {}
    from app.warehouse.service.standardization import _quote_ident
    for table_name in sorted(set(aliases.values())):
        await db.execute(text(f"LOCK TABLE {_quote_ident(table_name)} IN ACCESS SHARE MODE"))
        rows = (await db.execute(text(
            "SELECT array_agg(a.attname ORDER BY k.ordinality) "
            "FROM pg_index i JOIN pg_class t ON t.oid=i.indrelid "
            "JOIN pg_namespace n ON n.oid=t.relnamespace "
            "CROSS JOIN LATERAL unnest(i.indkey) WITH ORDINALITY AS k(attnum, ordinality) "
            "JOIN pg_attribute a ON a.attrelid=t.oid AND a.attnum=k.attnum "
            "WHERE n.nspname=current_schema() AND t.relname=:table_name "
            "AND i.indisunique AND i.indisvalid AND i.indisready AND i.indimmediate "
            "AND i.indpred IS NULL AND i.indexprs IS NULL AND k.ordinality<=i.indnkeyatts "
            "GROUP BY i.indexrelid"
        ), {"table_name": table_name})).scalars().all()
        unique_by_table[table_name] = [set(row) for row in rows]
    issues = []
    for relation in relations:
        required = []
        if relation.cardinality in {"1:1", "1:N"}:
            required.append((relation.left_alias, {key["left"] for key in relation.keys}))
        if relation.cardinality in {"1:1", "N:1"}:
            required.append((relation.right_alias, {key["right"] for key in relation.keys}))
        if any(not any(unique <= keys for unique in unique_by_table.get(aliases.get(alias), []))
               for alias, keys in required):
            issues.append({"code": "authorization_relation_cardinality_unverified", "message": "关联唯一侧缺少有效的即时非部分唯一约束"})
    return issues


def _snapshot_drift(snapshot, tables, relations, outputs) -> bool:
    current = _snapshot(tables, relations, outputs)
    for key in ("tables", "relations", "outputs"):
        items = snapshot.get(key)
        if not isinstance(items, list) or any(not isinstance(item, dict) or item.get("id") is None for item in items):
            return True
        expected = {item["id"]: item for item in items}
        actual = {item["id"]: item for item in current[key]}
        if len(expected) != len(items) or set(expected) != set(actual):
            return True
        # 只比较快照中记录的字段，向后兼容新增的快照字段
        for item_id, recorded in expected.items():
            if any(field != "is_visible" and actual[item_id].get(field) != value for field, value in recorded.items()):
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


def _usable_binding(binding, field) -> bool:
    return (
        binding.status == "confirmed"
        and binding.binding_version > 0
        and binding.confirmed_by is not None
        and binding.confirmed_at is not None
        and field is not None
        and field.is_active
    )


async def _confirmed_output_bindings(db, dataset_id):
    rows = (await db.execute(
        select(DatasetOutputField, StandardFieldBinding, StandardField)
        .select_from(DatasetOutputField)
        .join(StandardFieldBinding, StandardFieldBinding.dataset_output_field_id == DatasetOutputField.id)
        .join(StandardField, StandardField.id == StandardFieldBinding.standard_field_id)
        .where(DatasetOutputField.dataset_id == dataset_id)
    )).all()
    by_code: dict[str, list] = {}
    for output, binding, field in rows:
        if _usable_binding(binding, field):
            by_code.setdefault(field.field_code, []).append((output, binding, field))
    return by_code


async def _confirmed_column_bindings(db, table_name):
    rows = (await db.execute(
        select(TableColumn, StandardFieldBinding, StandardField)
        .select_from(TableColumn)
        .join(StandardFieldBinding, StandardFieldBinding.table_column_id == TableColumn.id)
        .join(StandardField, StandardField.id == StandardFieldBinding.standard_field_id)
        .where(TableColumn.table_name == table_name)
    )).all()
    by_code: dict[str, list] = {}
    for column, binding, field in rows:
        if _usable_binding(binding, field):
            by_code.setdefault(field.field_code, []).append((column, binding, field))
    return by_code


def _resolution_error(code: str, message: str):
    return HTTPException(400, detail={"code": code, "message": message})


async def _resolve_standard_definition(db, dataset_id, payload):
    """schema 2: 标准字段编码 → 唯一输出/物理列；归一化后复用现有校验与执行。

    输入约定：
    - output_fields/dimensions/measures/internal_fields 均为标准字段编码；
    - facts 的 employee_key/cost_center_key 为标准字段编码，fact_key 仍为物理主键列名；
    - 服务端解析后把上述字段替换为输出编码/物理列名，并写入 resolved_standard_fields。
    """
    if payload.schema_version != 2 or payload.resolved_standard_fields:
        return payload
    if len(payload.facts) != 1:
        raise _resolution_error("standard_field_contract_scope_unsupported", "schema 2 当前仅支持单一事实")
    output_bindings = await _confirmed_output_bindings(db, dataset_id)
    tables = (await db.execute(select(DataSetTable).where(DataSetTable.dataset_id == dataset_id))).scalars().all()
    aliases = {row.alias: row.table_name for row in tables}
    resolved: dict[str, dict] = {"outputs": {}, "columns": {}}

    def pick_output(code: str, *, require_dimension: bool = False) -> str:
        candidates = output_bindings.get(code, [])
        if not candidates:
            raise _resolution_error("standard_field_not_bound", f"标准字段未绑定到数据集输出: {code}")
        if len(candidates) != 1:
            raise _resolution_error("standard_field_ambiguous", f"标准字段绑定了多个数据集输出: {code}")
        output, _binding, field = candidates[0]
        if _normalized_metadata_type(field.data_type) != _normalized_metadata_type(output.data_type):
            raise _resolution_error("standard_field_type_mismatch", f"标准字段与输出类型不一致: {code}")
        if require_dimension and field.grain_level not in {"coarse", "fine"}:
            raise _resolution_error("standard_field_grain_invalid", f"标准字段不能作为分组维度: {code}")
        resolved["outputs"].setdefault(code, {
            "output_code": output.output_code, "output_id": output.id,
            "standard_field_id": field.id,
        })
        return output.output_code

    output_codes = [pick_output(code) for code in payload.output_fields]
    dimension_codes = [pick_output(code, require_dimension=True) for code in payload.dimensions]
    measure_codes = [pick_output(code) for code in payload.measures]
    detail_codes = [pick_output(code) for code in payload.detail_output_fields]

    facts = []
    column_cache: dict[str, dict] = {}
    for fact in payload.facts:
        if aliases.get(fact.alias) != fact.table_name:
            raise _resolution_error("contract_fact_table_mismatch", f"事实别名未映射到声明表: {fact.alias}")
        column_bindings = column_cache.setdefault(fact.table_name, await _confirmed_column_bindings(db, fact.table_name))

        def pick_anchor(code: str, domain: str) -> str:
            candidates = column_bindings.get(code, [])
            if len(candidates) != 1:
                raise _resolution_error("standard_field_anchor_invalid", f"授权锚点必须唯一绑定到事实列: {code}")
            column, _binding, field = candidates[0]
            if (not field.is_permission_anchor or field.permission_domain != domain
                    or field.grain_level not in {"coarse", "fine"}):
                raise _resolution_error("standard_field_anchor_invalid", f"授权锚点语义无效: {code}")
            if _normalized_metadata_type(field.data_type) != _normalized_metadata_type(column.data_type):
                raise _resolution_error("standard_field_anchor_invalid", f"授权锚点与事实列类型不一致: {code}")
            resolved["columns"][code] = {
                "column_code": column.column_code, "column_id": column.id,
                "standard_field_id": field.id,
            }
            return column.column_code

        employee_key = pick_anchor(fact.employee_key, "org") if fact.employee_key else None
        cost_center_key = pick_anchor(fact.cost_center_key, "cost_center") if fact.cost_center_key else None
        facts.append(fact.model_copy(update={"employee_key": employee_key, "cost_center_key": cost_center_key}))

    internal_fields: list[str] = []
    for code in payload.internal_fields:
        if code in resolved["outputs"]:
            internal_fields.append(f"{facts[0].alias}.{resolved['outputs'][code]['output_code']}")
            continue
        found = False
        for fact in facts:
            column_bindings = column_cache.setdefault(fact.table_name, await _confirmed_column_bindings(db, fact.table_name))
            candidates = column_bindings.get(code, [])
            if len(candidates) == 1:
                column, _binding, field = candidates[0]
                resolved["columns"][code] = {
                    "column_code": column.column_code, "column_id": column.id,
                    "standard_field_id": field.id,
                }
                internal_fields.append(f"{fact.alias}.{column.column_code}")
                found = True
                break
        if not found:
            raise _resolution_error("standard_field_not_bound", f"内部字段未绑定到事实列或输出: {code}")

    for fact in facts:
        for column in {fact.fact_key, fact.employee_key, fact.cost_center_key} - {None}:
            entry = f"{fact.alias}.{column}"
            if entry not in internal_fields:
                internal_fields.append(entry)

    payload.output_fields = output_codes
    payload.dimensions = dimension_codes
    payload.measures = measure_codes
    payload.detail_output_fields = detail_codes
    payload.internal_fields = internal_fields
    payload.facts = facts
    payload.resolved_standard_fields = resolved
    return payload


async def _validate_resolution(db, dataset_id, payload):
    """批准前复核：确认映射仍指向同一有效标准字段身份。"""
    if payload.schema_version != 2 or not payload.resolved_standard_fields:
        return

    async def check(field, code: str, target_id, standard_field_id):
        rows = (await db.execute(
            select(StandardField.id)
            .select_from(StandardFieldBinding)
            .join(StandardField, StandardField.id == StandardFieldBinding.standard_field_id)
            .where(field == target_id, StandardFieldBinding.status == "confirmed",
                   StandardField.is_active.is_(True))
        )).scalars().all()
        if len(rows) != 1 or rows[0] != standard_field_id:
            raise HTTPException(409, detail={
                "code": "standard_field_binding_drift",
                "message": f"标准字段绑定已漂移，请重新检查合同: {code}",
            })

    for code, item in (payload.resolved_standard_fields.get("outputs") or {}).items():
        await check(StandardFieldBinding.dataset_output_field_id, code, item.get("output_id"), item.get("standard_field_id"))
    for code, item in (payload.resolved_standard_fields.get("columns") or {}).items():
        await check(StandardFieldBinding.table_column_id, code, item.get("column_id"), item.get("standard_field_id"))


async def _validate_definition(db, dataset_id, payload):
    payload = await _resolve_standard_definition(db, dataset_id, payload)
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
    for code in payload.detail_output_fields:
        if code not in output_codes:
            raise HTTPException(400, detail={"code": "contract_detail_field_not_in_output", "message": f"明细字段不属于数据集输出白名单: {code}"})
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
        await _validate_resolution(db, dataset_id, current)
        if len(current.facts) != 1:
            from app.datasets.multifact_execution import validate_multifact_shape
            shape_issues = validate_multifact_shape(current, _snapshot(tables, relations, outputs))
            if shape_issues:
                raise HTTPException(409, detail={"code": "multi_fact_not_implemented", "message": "该多事实形态尚未通过受控执行校验", "issues": shape_issues})
            cardinality_issues = await _validate_relation_cardinality_constraints(db, tables, relations)
            if cardinality_issues:
                raise HTTPException(409, detail=cardinality_issues[0])
        if len(current.facts) == 1 and (relations
                or any(f.role not in {"person_fact", "allocation_fact"} for f in current.facts)
                or (current.facts[0].role == "person_fact" and (current.facts[0].allow_cost_center_summary or current.facts[0].cost_center_key))
                or (current.facts[0].role == "allocation_fact" and (not current.facts[0].allow_cost_center_summary or not current.facts[0].cost_center_key))):
            raise HTTPException(409, detail={"code": "contract_execution_validation_required", "message": "当前执行切片仅允许单一person_fact或已批准成本中心汇总的allocation_fact且不含JOIN"})
        if len(current.facts) == 1 and current.facts[0].role == "allocation_fact":
            from app.datasets.d_execution import SExecutionBindingIn, validate_allocation_fact_s_execution
            from app.warehouse.schemas import ExecutionPlanIn
            if current.schema_version == 3:
                derived = derived_summary_fields(current, outputs)
                numeric_measures = [code for code in derived["measures"]
                                    if next((o for o in outputs if o.output_code == code), None) is not None
                                    and _normalized_metadata_type(next(o for o in outputs if o.output_code == code).data_type) == "number"]
                sample_outputs = [*derived["dimensions"], *numeric_measures]
                sample_plan = ExecutionPlanIn(
                    output_fields=sample_outputs or derived["dimensions"][:1],
                    group_by=derived["dimensions"],
                    aggregations={code: "sum" for code in numeric_measures},
                ) if sample_outputs else None
            else:
                sample_plan = ExecutionPlanIn(
                    output_fields=current.output_fields, group_by=current.dimensions,
                    aggregations={code: "sum" for code in current.measures})
            if sample_plan is not None:
                validation = validate_allocation_fact_s_execution(
                    {"id": row.id, "dataset_id": dataset_id, "contract_version": row.contract_version,
                     "status": "active", "contract_json": row.contract_json,
                     "model_snapshot": _snapshot(tables, relations, outputs)},
                    SExecutionBindingIn(dataset_id=dataset_id, contract_id=row.id,
                        contract_version=row.contract_version, plan=sample_plan))
                if not validation.eligible or len(tables) != 1:
                    raise HTTPException(409, detail={"code": "contract_execution_validation_required", "message": "分摊事实锚点、维度或度量未通过汇总合同校验"})
            elif len(tables) != 1:
                raise HTTPException(409, detail={"code": "contract_execution_validation_required", "message": "分摊事实锚点、维度或度量未通过汇总合同校验"})
        physical_issues = await _collect_contract_physical_drift(db, current, tables, relations, outputs)
        if physical_issues:
            raise HTTPException(409, detail={"code": "contract_physical_validation_failed", "message": "授权合同引用的字段物理结构未通过校验"})
        # 批准时刷新结构快照：批准才是真正绑定时刻，同时补全新增的快照字段（如 agg_role）
        row.model_snapshot = _snapshot(tables, relations, outputs)
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


class PermissionMappingReadinessOut(BaseModel):
    dataset_id: int
    contract_id: int | None = None
    contract_version: int | None = None
    eligible: bool
    issues: list[dict[str, str]]
    checked_areas: list[str]


async def permission_mapping_readiness(db, dataset_id, user=None):
    dataset = await db.get(DataSet, dataset_id)
    if dataset is None:
        raise HTTPException(404, detail={"code": "dataset_not_found", "message": "数据集不存在"})
    if user is not None:
        from app.datasets.router import _can_access
        if not await _can_access(user, dataset, db):
            raise HTTPException(403, detail={"code": "dataset_acl_denied", "message": "当前用户不具备数据集资源访问权"})
    issues = []
    checked = ["contract_snapshot", "fact_keys", "permission_field_bindings", "physical_schema", "relation_paths"]
    rows = (await db.execute(select(DataProductAuthorizationContract).where(
        DataProductAuthorizationContract.dataset_id == dataset_id,
        DataProductAuthorizationContract.status == "active",
    ).order_by(DataProductAuthorizationContract.contract_version.desc()).limit(2))).scalars().all()
    result = PermissionMappingReadinessOut(dataset_id=dataset_id, eligible=False, issues=[], checked_areas=checked)
    if len(rows) != 1:
        result.issues = [{"code": "authorization_contract_ambiguous" if rows else "authorization_contract_missing",
                          "message": "事实与权限用途声明必须有且仅有一份已生效配置"}]
        return result
    contract = rows[0]
    result.contract_id = contract.id
    result.contract_version = contract.contract_version
    try:
        definition = ProductAuthorizationDefinition.model_validate(contract.contract_json)
    except (TypeError, ValueError, ValidationError):
        result.issues = [{"code": "authorization_contract_invalid", "message": "事实与权限用途声明定义无效"}]
        return result
    tables = (await db.execute(select(DataSetTable).where(DataSetTable.dataset_id == dataset_id))).scalars().all()
    relations = (await db.execute(select(DataSetRelation).where(DataSetRelation.dataset_id == dataset_id))).scalars().all()
    outputs = (await db.execute(select(DatasetOutputField).where(DatasetOutputField.dataset_id == dataset_id))).scalars().all()
    aliases = {table.alias: table.table_name for table in tables}
    if dataset.is_active is not True or dataset.status not in {"draft", "published"}:
        issues.append({"code": "dataset_inactive", "message": "模型已停用或状态无效，不能用于权限字段关联"})
    if not tables or len(aliases) != len(tables):
        issues.append({"code": "permission_source_invalid", "message": "模型来源为空或来源别名不唯一，请到数据建模修复"})
    if not isinstance(contract.model_snapshot, dict) or _snapshot_drift(contract.model_snapshot, tables, relations, outputs):
        issues.append({"code": "authorization_contract_drift", "message": "事实与权限用途声明与当前模型结构不一致，请重新确认声明"})
    relation_issues = _validate_relation_metadata(relations, set(aliases))
    issues.extend(relation_issues)
    if not relation_issues:
        issues.extend(await _collect_contract_physical_drift(db, definition, tables, relations, outputs))
        graph = {alias: set() for alias in aliases}
        for relation in relations:
            graph[relation.left_alias].add(relation.right_alias)
            graph[relation.right_alias].add(relation.left_alias)
        reached = set()
        pending = list(aliases)[:1]
        while pending:
            alias = pending.pop()
            if alias not in reached:
                reached.add(alias)
                pending.extend(graph[alias] - reached)
        if reached != set(aliases):
            issues.append({"code": "permission_relation_disconnected", "message": "权限字段的来源关联路径未连通，请到数据建模补齐关联键"})
    binding_rows = (await db.execute(
        select(TableColumn, StandardFieldBinding, StandardField)
        .select_from(TableColumn)
        .outerjoin(StandardFieldBinding, StandardFieldBinding.table_column_id == TableColumn.id)
        .outerjoin(StandardField, StandardField.id == StandardFieldBinding.standard_field_id)
        .where(TableColumn.table_name.in_(set(aliases.values())))
    )).all()
    by_column = {}
    for column, binding, field in binding_rows:
        by_column.setdefault((column.table_name, column.column_code), []).append((column, binding, field))
    if not relation_issues:
        for relation in relations:
            for key in relation.keys:
                left = by_column.get((aliases[relation.left_alias], key["left"]), [])
                right = by_column.get((aliases[relation.right_alias], key["right"]), [])
                if left and right and _normalized_metadata_type(left[0][0].data_type) != _normalized_metadata_type(right[0][0].data_type):
                    issues.append({"code": "permission_relation_type_mismatch", "message": f"关联字段 {relation.left_alias}.{key['left']} 与 {relation.right_alias}.{key['right']} 类型不兼容，请到数据建模修复"})
    from app.warehouse.service.standard_fields import _physical_source_identity
    for fact in definition.facts:
        if aliases.get(fact.alias) != fact.table_name:
            issues.append({"code": "permission_fact_source_invalid", "message": f"事实 {fact.alias} 未关联到声明来源 {fact.table_name}"})
            continue
        for key, domain, label in ((fact.employee_key, "org", "人员"), (fact.cost_center_key, "cost_center", "成本中心")):
            if not key:
                continue
            candidates = by_column.get((fact.table_name, key), [])
            if len(candidates) != 1 or candidates[0][1] is None:
                issues.append({"code": "permission_anchor_binding_missing", "message": f"{label}字段 {fact.alias}.{key} 缺少唯一标准字段映射，请到来源映射确认"})
                continue
            column, binding, field = candidates[0]
            identity = column.source_field_id or _physical_source_identity(column.table_name, column.column_code)
            if not _usable_binding(binding, field):
                issues.append({"code": "permission_anchor_binding_invalid", "message": f"{label}字段 {fact.alias}.{key} 的标准字段映射未确认或已失效"})
            elif binding.observed_source_field_id != identity:
                issues.append({"code": "permission_anchor_identity_drift", "message": f"{label}字段 {fact.alias}.{key} 来源身份已漂移"})
            elif not field.is_permission_anchor or field.permission_domain != domain:
                issues.append({"code": "permission_anchor_semantics_invalid", "message": f"{label}字段 {fact.alias}.{key} 关联的标准字段 {field.field_code} 不是对应权限锚点"})
            elif len({_normalized_metadata_type(value) for value in (column.data_type, binding.observed_data_type, field.data_type)}) != 1:
                issues.append({"code": "permission_anchor_type_drift", "message": f"{label}字段 {fact.alias}.{key} 与标准字段 {field.field_code} 类型不一致"})
    result.issues = issues
    result.eligible = not issues
    return result


class AuthorizationExecutionReadinessOut(BaseModel):
    dataset_id: int
    contract_id: int | None
    contract_version: int | None
    runtime_enabled: bool = False
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
    is_multifact = False
    if len(definition.facts) > 1:
        from app.datasets.multifact_execution import validate_multifact_shape
        shape_issues = validate_multifact_shape(definition, snapshot)
        issues.extend(shape_issues)
        if not shape_issues and not issues:
            issues.extend(await _validate_relation_cardinality_constraints(db, tables, relations))
            is_multifact = True
    is_limited_allocation = (len(definition.facts) == 1 and len(tables) == 1 and not relations
                            and definition.facts[0].role == "allocation_fact"
                            and definition.facts[0].allow_cost_center_summary
                            and bool(definition.facts[0].cost_center_key))
    checked = ["contract_snapshot", "fact_roles", "current_user_acl", "contract_physical_schema", "tree_health"]
    if is_limited_allocation or is_multifact:
        if dataset.status != "published":
            issues.append({"code": "dataset_not_published", "message": "数据集尚未发布，不可运行"})
        for path in paths:
            path.detail_mode = "not_allowed"
        if not issues:
            from app.warehouse.service.release_gate import check_dataset_release
            release = await check_dataset_release(db, dataset_id)
            issues.extend({"code": item.code, "message": item.message} for item in release.issues)
            if not issues and not (release.eligible and release.fields_eligible
                                   and release.authorization_verified and release.conversion_verified):
                issues.append({"code": "allocation_release_not_ready", "message": "完整发布和转换准入尚未通过"})
            checked.extend(["output_fields", "conversion_approval", "external_exports"])
        if not issues:
            from app.datasets.d_execution import SExecutionBindingIn, compile_allocation_fact_s_select_for_user
            from app.warehouse.schemas import ExecutionPlanIn
            outputs = (await db.execute(select(DatasetOutputField).where(
                DatasetOutputField.dataset_id == dataset_id))).scalars().all()
            by_code = {output.output_code: output for output in outputs}
            if definition.schema_version == 3:
                derived = derived_summary_fields(definition, outputs)
                runtime_dimensions = derived["dimensions"]
                runtime_measures = derived["measures"]
                runtime_outputs = derived["summary_outputs"]
            else:
                runtime_dimensions = definition.dimensions
                runtime_measures = definition.measures
                runtime_outputs = definition.output_fields
            if is_multifact:
                runtime_dimensions = []
                runtime_outputs = runtime_measures
            if (not runtime_measures or (not runtime_dimensions and not is_multifact)
                    or not set(runtime_outputs) <= set(by_code)
                    or set(runtime_outputs) != set(runtime_dimensions) | set(runtime_measures)
                    or any(_normalized_metadata_type(by_code[code].data_type) != "number"
                           for code in runtime_measures)):
                issues.append({"code": "allocation_runtime_shape_unsupported", "message": "当前运行切片要求全部输出为批准维度和数值度量"})
            else:
                request = SExecutionBindingIn(dataset_id=dataset_id, contract_id=row.id,
                    contract_version=row.contract_version, plan=ExecutionPlanIn(
                        output_fields=runtime_outputs, group_by=runtime_dimensions,
                        aggregations={code: "sum" for code in runtime_measures}))
                statement, compile_issues = await compile_allocation_fact_s_select_for_user(
                    contract={"id": row.id, "dataset_id": dataset_id, "contract_version": row.contract_version,
                              "status": row.status, "contract_json": row.contract_json, "model_snapshot": row.model_snapshot},
                    request=request, user=user, db=db)
                issues.extend(compile_issues)
                if statement is None and not compile_issues:
                    issues.append({"code": "allocation_compiler_unavailable", "message": "无法安全编译汇总计划"})
            checked.extend(["tree_scope_expansion", "single_fact_primary_key", "field_execution", "limited_allocation_s_compiler"])
    else:
        issues.extend([
            {"code": "tree_validation_required", "message": "当前路径尚未接入运行时权限树展开"},
            {"code": "sql_compiler_not_integrated", "message": "当前路径尚未接入查询执行器"},
        ])
    enabled = (is_limited_allocation or is_multifact) and not issues
    return AuthorizationExecutionReadinessOut(
        dataset_id=dataset_id, contract_id=row.id, contract_version=row.contract_version,
        eligible=enabled, runtime_enabled=enabled, paths=paths, issues=issues, checked_areas=checked,
        unchecked_areas=["complex_joins", "detail_drilldown"] if enabled else ["runtime_execution"],
    )
