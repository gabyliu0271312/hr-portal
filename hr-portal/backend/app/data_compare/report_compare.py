"""Authorized, bounded comparisons of final report output and registered tables."""
from __future__ import annotations

import hashlib
import json
import re
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from typing import Literal

from fastapi import HTTPException
from pydantic import BaseModel, Field, field_validator, model_validator
from sqlalchemy import select, text


class ReportCompareMetric(BaseModel):
    model_config = {"extra": "forbid"}
    id: str = Field(min_length=1, max_length=128)
    label: str = Field(min_length=1, max_length=256)
    column_a: str = Field(min_length=1, max_length=256)
    expression_b: str = Field(min_length=1, max_length=1024)
    tolerance: str

    @field_validator("tolerance")
    @classmethod
    def valid_tolerance(cls, value):
        try:
            number = Decimal(value)
        except InvalidOperation as exc:
            raise ValueError("容差必须为非负有限十进制数") from exc
        if not number.is_finite() or number < 0:
            raise ValueError("容差必须为非负有限十进制数")
        return value


class ReportCompareDimension(BaseModel):
    model_config = {"extra": "forbid"}
    column_a: str = Field(min_length=1, max_length=256)
    column_b: str = Field(min_length=1, max_length=256)
    value_map_b: dict[str, str] = Field(default_factory=dict)


class ReportCompareSpec(BaseModel):
    model_config = {"extra": "forbid"}
    kind: Literal["report_amount_v1"]
    report_id: int = Field(gt=0)
    table_b: str = Field(min_length=1, max_length=256)
    period_field_a: str = Field(min_length=1, max_length=256)
    periods: list[str] = Field(min_length=1, max_length=120)
    metrics: list[ReportCompareMetric] = Field(min_length=1, max_length=50)
    dimension: ReportCompareDimension

    @field_validator("periods")
    @classmethod
    def valid_periods(cls, values):
        if len(set(values)) != len(values) or any(not re.fullmatch(r"\d{4}(0[1-9]|1[0-2])", value) for value in values):
            raise ValueError("期间必须是无重复的有效 YYYYMM")
        return values

    @model_validator(mode="after")
    def unique_metrics(self):
        if len({metric.id for metric in self.metrics}) != len(self.metrics):
            raise ValueError("指标 ID 不能重复")
        return self


def _dump(row):
    from sqlalchemy import inspect
    return {item.key: getattr(row, item.key) for item in inspect(type(row)).column_attrs}


def _hash(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=False, default=str).encode()).hexdigest()


def compile_amount_expression(expression, fields):
    from app.ai_formula.ast.compiler import FormulaCompileOptions, compile_formula, resolver_from_field_meta
    result = compile_formula(expression, resolver_from_field_meta(fields), options=FormulaCompileOptions(mode="expression", include_ast=True))

    def allowed(node):
        if not isinstance(node, dict): return False
        kind = node.get("type")
        if kind == "Literal": return node.get("literal_type") == "number"
        if kind == "FieldRef": return bool(node.get("resolved_column"))
        if kind == "BinaryOp": return node.get("op") in {"+", "-", "*", "/"} and allowed(node.get("left")) and allowed(node.get("right"))
        if kind == "UnaryOp": return node.get("op") in {"+", "-"} and allowed(node.get("operand"))
        return False

    if not result.valid or result.functions or result.has_aggregate or not allowed(result.ast):
        raise ValueError("表达式仅支持已授权数值字段、数值常量和基础算术")
    return result


async def _table_context(name, user, db):
    from app.data.column_roles import business_column_filter
    from app.data.models import DATA_TABLES, RegisteredTable, TableColumn
    from app.data_compare.executor import _build_scope_sql
    from app.permissions.masker import get_hidden_columns, get_sensitive_columns
    table = await db.scalar(select(RegisteredTable).where(RegisteredTable.table_name == name))
    if table is None or name not in DATA_TABLES:
        raise HTTPException(403, detail="来源表不可用")
    scope = await _build_scope_sql(user, name, db, table.scope_strategy or "cross_filter")
    if scope.strip().lower() == "false":
        raise HTTPException(403, detail="无权访问来源表")
    rows = (await db.execute(select(TableColumn).where(TableColumn.table_name == name, business_column_filter(TableColumn)))).scalars().all()
    blocked = (await get_hidden_columns(user, name, db)) | (await get_sensitive_columns(user, name, db))
    blocked |= {row.column_code for row in rows if row.is_sensitive}
    columns = {row.column_code: row for row in rows if row.column_code not in blocked}
    return table, columns, scope, {"table": _dump(table), "columns": [_dump(row) for row in rows], "blocked": sorted(blocked), "scope": scope}


async def _report_context(report, user, db):
    from app.datasets.models import DataSet, DataSetTable, DataSetRelation, DatasetOutputField
    from app.datasets.calculated_fields import active_calculated_fields
    from app.reports.report_service import prepare_report_query, require_authorized_report_readiness, validate_authorized_report_plan
    from app.reports.validation import resolve_report_source_alias
    config = await prepare_report_query(report, user, db)
    tables = (await db.execute(select(DataSetTable).where(DataSetTable.dataset_id == report.dataset_id))).scalars().all()
    relations = (await db.execute(select(DataSetRelation).where(DataSetRelation.dataset_id == report.dataset_id))).scalars().all()
    outputs = (await db.execute(select(DatasetOutputField).where(DatasetOutputField.dataset_id == report.dataset_id))).scalars().all()
    calcs = await active_calculated_fields(report.dataset_id, db)
    by_calc = {f"calc.{row.code}": row for row in calcs}
    contexts, facts = {}, []
    for table in tables:
        _, columns, _, fact = await _table_context(table.table_name, user, db)
        contexts[table.alias] = columns
        facts.append(fact)

    def source_meta(source, seen=None):
        seen = set() if seen is None else set(seen)
        if source in seen: raise HTTPException(422, detail="计算字段循环依赖")
        seen.add(source)
        if source.startswith("calc."):
            calc = by_calc.get(source)
            if calc is None: raise HTTPException(422, detail="计算字段已失效")
            if calc.is_sensitive: raise HTTPException(403, detail="计算字段需要脱敏")
            for dependency in calc.depends_on or []: source_meta(dependency, seen)
            return {"data_type": calc.data_type, "agg_role": calc.agg_role, "label": calc.label}
        matches = [row for row in outputs if row.output_code == source]
        if len(matches) == 1: alias, code = matches[0].source_alias, matches[0].source_column
        elif "." in source: alias, code = source.split(".", 1)
        else: raise HTTPException(422, detail="无法唯一解析报表字段")
        alias = resolve_report_source_alias(alias, tables)
        column = contexts.get(alias, {}).get(code)
        if column is None: raise HTTPException(403, detail="报表字段或计算依赖不可用于比较")
        return {"data_type": column.data_type, "agg_role": column.agg_role, "label": column.column_label}

    # A report's split/reshape dependencies may influence other visible outputs.
    # Reject masked dependencies rather than recomputing or trusting masked values.
    from app.reports.validation import iter_report_source_references
    for _, source in iter_report_source_references(config):
        source_meta(source)
    candidates = []
    for column in config.columns:
        if config.column_settings.get(column.instance_id, {}).get("hidden"): continue
        try: meta = source_meta(column.source_code)
        except HTTPException: continue
        candidates.append({"code": column.instance_id, "label": column.label or meta["label"] or column.instance_id, **{k: meta[k] for k in ("data_type", "agg_role")}})
    readiness = None
    if (report.execution_version or "legacy_v1") != "legacy_v1":
        readiness = await require_authorized_report_readiness(report, user, db)
        await validate_authorized_report_plan(report=report, readiness=readiness, user=user, db=db)
    dataset = await db.get(DataSet, report.dataset_id)
    definition = _dump(report)
    for key in ("last_run_at", "run_count", "updated_at"): definition.pop(key, None)
    return config, candidates, {"report": definition, "dataset": _dump(dataset), "tables": [_dump(row) for row in tables],
        "relations": [_dump(row) for row in relations], "outputs": [_dump(row) for row in outputs], "calcs": [_dump(row) for row in calcs], "facts": facts,
        "readiness": {key: getattr(readiness, key, None) for key in ("contract_id", "contract_version")} if readiness else None}


async def discover_report_compare_metadata(user, db):
    from app.reports.models import Report
    from app.data.models import RegisteredTable
    result = {"reports": [], "tables": []}
    for report in (await db.execute(select(Report).order_by(Report.id))).scalars().all():
        try: config, columns, _ = await _report_context(report, user, db)
        except (HTTPException, ValueError): continue
        result["reports"].append({"id": report.id, "name": report.name, "columns": columns, "period_fields": [item.column for item in config.filters if item.visible and not item.locked]})
    for table in (await db.execute(select(RegisteredTable))).scalars().all():
        try: table, columns, _, _ = await _table_context(table.table_name, user, db)
        except HTTPException: continue
        if not table.is_period or table.period_col not in columns: continue
        result["tables"].append({"table": table.table_name, "label": table.table_label, "period_field": table.period_col,
            "columns": [{"code": row.column_code, "label": row.column_label, "data_type": row.data_type} for row in columns.values()]})
    return result


async def validate_report_compare(spec, user, db):
    from app.reports.models import Report
    from app.ai_formula.ast.semantics import FieldInfo
    from app.permissions.scope_filter import _get_user_tags
    spec = ReportCompareSpec.model_validate(spec)
    report = await db.get(Report, spec.report_id)
    if report is None: raise HTTPException(404, detail="报表不存在")
    config, candidates, fingerprint_a = await _report_context(report, user, db)
    if config.filter_logic:
        raise HTTPException(422, detail="当前比较不支持存在歧义的自定义期间筛选逻辑")
    periods = [item for item in config.filters if item.column == spec.period_field_a]
    if len(periods) != 1 or not periods[0].visible or periods[0].locked:
        raise HTTPException(422, detail="报表必须配置唯一、可见且未锁定的期间筛选")
    if (spec.period_field_a not in {f"{table['alias']}.{fact['table']['period_col']}"
            for table in fingerprint_a["tables"] for fact in fingerprint_a["facts"]
            if table["table_name"] == fact["table"]["table_name"] and fact["table"].get("is_period")}):
        raise HTTPException(422, detail="报表期间筛选必须引用已注册月度表的期间字段")
    by_code = {row["code"]: row for row in candidates}
    if spec.dimension.column_a not in by_code or config.aggregations.get(spec.dimension.column_a):
        raise HTTPException(422, detail="维度必须已存在于报表最终可见维度输出")
    for metric in spec.metrics:
        column = by_code.get(metric.column_a)
        if (column is None or column["data_type"] not in {"number", "numeric", "decimal", "integer", "float"}
                or column["agg_role"] != "measure" or config.aggregations.get(metric.column_a, "sum") != "sum"):
            raise HTTPException(422, detail="指标必须是明确可加总的报表金额输出，不支持均值或比例推定")
    table, columns, _, fingerprint_b = await _table_context(spec.table_b, user, db)
    if not table.is_period or table.period_col not in columns or spec.dimension.column_b not in columns:
        raise HTTPException(422, detail="B来源必须有已授权期间字段和维度")
    fields = [FieldInfo(alias="b", column=row.column_code, data_type="number", label=row.column_label) for row in columns.values()
              if row.data_type in {"number", "numeric", "decimal", "integer", "float"}]
    for metric in spec.metrics: compile_amount_expression(metric.expression_b, fields)
    tags = await _get_user_tags(user.id, db)
    tag_data = [[_dump(tag), [_dump(row) for row in selections], [_dump(row) for row in filters]] for tag, selections, filters in tags]
    return {"spec": spec.model_dump(), "fingerprint": _hash({"report": fingerprint_a, "table_b": fingerprint_b, "tags": tag_data, "user_id": user.id})}


async def validate_snapshot(snapshot, user, db):
    if not isinstance(snapshot, dict) or snapshot.get("kind") != "report_amount_v1" or snapshot.get("executed_by") != user.id:
        raise HTTPException(403, detail="无权访问此运行快照")
    current = await validate_report_compare(snapshot.get("spec"), user, db)
    if current["fingerprint"] != snapshot.get("fingerprint"):
        raise HTTPException(409, detail="当前权限或来源定义已变化，请重新执行")


def _amount(value):
    if value is None or value == "": return None
    try: number = Decimal(str(value))
    except InvalidOperation as exc: raise HTTPException(422, detail="金额输出不是有效数值") from exc
    if not number.is_finite(): raise HTTPException(422, detail="金额输出不是有限数值")
    return number


def _eval_ast(node, values):
    kind = node["type"]
    if kind == "Literal": return _amount(node["value"])
    if kind == "FieldRef": return _amount(values.get(node["resolved_column"]))
    if kind == "UnaryOp":
        value = _eval_ast(node["operand"], values)
        return None if value is None else (value if node["op"] == "+" else -value)
    left, right = _eval_ast(node["left"], values), _eval_ast(node["right"], values)
    if left is None or right is None: return None
    if node["op"] == "+": return left + right
    if node["op"] == "-": return left - right
    if node["op"] == "*": return left * right
    return None if right == 0 else left / right


def _aggregate_rows(rows, dimension, metrics, value, mapping=None, budget=None):
    groups, totals = {}, {}
    for metric in metrics:
        total, valid, nulls = Decimal(0), 0, 0
        buckets = {}
        for row in rows:
            raw_dim = row.get(dimension)
            dim = None if raw_dim is None else str(raw_dim)
            if mapping and dim is not None: dim = mapping.get(dim, dim)
            if budget is not None:
                budget.check(groups=sum(len(group) for group in groups.values()) + len(buckets) + (dim not in buckets))
            bucket = buckets.setdefault(dim, {"amount": Decimal(0), "valid": 0, "nulls": 0, "rows": 0})
            bucket["rows"] += 1
            number = value(metric, row)
            if number is None:
                nulls += 1
                bucket["nulls"] += 1
            else:
                total += number
                valid += 1
                bucket["amount"] += number
                bucket["valid"] += 1
        totals[metric.id] = {"amount": total, "valid": valid, "nulls": nulls, "rows": len(rows)}
        groups[metric.id] = buckets
    return totals, groups


def _compare(a, b, tolerance, missing_as_zero=False):
    amount_a, amount_b = a["amount"], b["amount"]
    incomplete = (not missing_as_zero and (not a["rows"] or not b["rows"])) or a["nulls"] or b["nulls"]
    return {"amount_a": str(amount_a) if a["valid"] or (missing_as_zero and not a["rows"]) else None, "amount_b": str(amount_b) if b["valid"] or (missing_as_zero and not b["rows"]) else None,
            "diff": str(amount_a - amount_b) if not incomplete else None,
            "status": "data_incomplete" if incomplete else ("match" if abs(amount_a - amount_b) <= tolerance else "diff"),
            "null_count_a": a["nulls"], "null_count_b": b["nulls"], "row_count_a": a["rows"], "row_count_b": b["rows"]}


async def execute_report_compare(spec, user, db):
    async with db.begin_nested():
        previous_timeout = await db.scalar(text("SELECT current_setting('statement_timeout')"))
        result = await _execute_report_compare(spec, user, db)
        await db.execute(text("SELECT set_config('statement_timeout', :value, true)"), {"value": previous_timeout})
        return result


async def _execute_report_compare(spec, user, db):
    from app.reports.models import Report
    from app.reports.report_service import prepare_report_query, run_audited_dataset_query
    from app.reports.router import _project_report_output
    from app.reports.sql_builder import ExecutionBudget
    from app.ai_formula.ast.semantics import FieldInfo
    from app.data.models import DATA_TABLES
    from app.permissions.scope_filter import build_scope_filter, _is_super_admin
    validated = await validate_report_compare(spec, user, db)
    spec = ReportCompareSpec.model_validate(spec)
    report = await db.get(Report, spec.report_id)
    table, columns, _, _ = await _table_context(spec.table_b, user, db)
    fields = [FieldInfo(alias="b", column=row.column_code, data_type="number") for row in columns.values()
              if row.data_type in {"number", "numeric", "decimal", "integer", "float"}]
    expressions = {metric.id: compile_amount_expression(metric.expression_b, fields) for metric in spec.metrics}
    model = DATA_TABLES[spec.table_b]
    if "raw" in model.__table__.columns: raise HTTPException(409, detail="B来源必须是实体列业务表")
    scope = None if await _is_super_admin(user, db) else await build_scope_filter(user, spec.table_b, db, strategy=table.scope_strategy or "cross_filter")
    if scope is None and not await _is_super_admin(user, db): raise HTTPException(403, detail="B来源无范围权限")
    dependencies = {spec.dimension.column_b, table.period_col}
    for expression in expressions.values():
        def collect(node):
            if node["type"] == "FieldRef": dependencies.add(node["resolved_column"])
            for key in ("left", "right", "operand"):
                if key in node: collect(node[key])
        collect(expression.ast)
    if not dependencies <= columns.keys() or not dependencies <= set(model.__table__.columns.keys()):
        raise HTTPException(403, detail="B公式或维度字段不可用")
    budget, summary, groups = ExecutionBudget(), [], []
    empty = {"amount": Decimal(0), "valid": 0, "nulls": 0, "rows": 0}
    for period in spec.periods:
        budget.check()
        await db.execute(text("SET LOCAL statement_timeout = '30000'"))
        cfg = await prepare_report_query(report, user, db, [{"column": spec.period_field_a, "op": "eq", "value": period}])
        query = cfg.model_dump()
        query.pop("quality_period_field", None)
        query.pop("default_split_rule", None)
        # Match the formal run route's accepted configuration arguments exactly.
        query = {key: query[key] for key in ("columns", "filters", "filter_logic", "sorts", "value_rules", "aggregate", "aggregations", "column_settings", "transpose", "rounding_corrections", "list_lookup", "dimension_merge_rules")}
        meta, rows_a, total = await run_audited_dataset_query(channel="report_compare", report_id=report.id, report=report,
            dataset_id=report.dataset_id, **query, page=1, page_size=0, user=user, db=db,
            scope_strategy=report.scope_strategy, execution_budget=budget, preserve_decimal=True)
        meta, rows_a = _project_report_output(meta, rows_a, cfg)
        required = {spec.dimension.column_a, *(metric.column_a for metric in spec.metrics)}
        if not required <= {column["code"] for column in meta} or len(rows_a) != total:
            raise HTTPException(422, detail="所选维度/指标不在完整最终输出中")
        stmt = select(*(model.__table__.c[code] for code in sorted(dependencies))).where(model.__table__.c[table.period_col] == period)
        if scope is not None: stmt = stmt.where(scope)
        rows_b = (await db.execute(stmt.limit(budget.max_rows + 1))).mappings().all()
        budget.check(rows=len(rows_b), cells=len(rows_b) * len(dependencies))
        totals_a, groups_a = _aggregate_rows(rows_a, spec.dimension.column_a, spec.metrics, lambda metric, row: _amount(row.get(metric.column_a)), budget=budget)
        totals_b, groups_b = _aggregate_rows(rows_b, spec.dimension.column_b, spec.metrics, lambda metric, row: _eval_ast(expressions[metric.id].ast, row), spec.dimension.value_map_b, budget=budget)
        for metric in spec.metrics:
            tolerance = Decimal(metric.tolerance)
            summary.append({"period": period, "metric_id": metric.id, "label": metric.label, **_compare(totals_a[metric.id], totals_b[metric.id], tolerance)})
            dims = set(groups_a[metric.id]) | set(groups_b[metric.id])
            for dim in sorted(dims, key=lambda value: (value is not None, value or "")):
                groups.append({"period": period, "metric_id": metric.id, "dimension": dim,
                    **_compare(groups_a[metric.id].get(dim, empty), groups_b[metric.id].get(dim, empty), tolerance, missing_as_zero=True)})
            budget.check(groups=len(groups))
    snapshot = {"kind": spec.kind, "spec": spec.model_dump(), "executed_by": user.id,
        "executed_at": datetime.now(timezone.utc).isoformat(), "fingerprint": validated["fingerprint"],
        "summary": {"items": summary, "diff_count": sum(item["status"] == "diff" for item in groups),
                    "incomplete_count": sum(item["status"] == "data_incomplete" for item in summary)}, "groups": groups}
    if len(json.dumps(snapshot, ensure_ascii=False).encode()) > budget.max_snapshot_bytes:
        raise HTTPException(422, detail="完整快照超出预算，未生成部分结果")
    budget.check()
    await validate_snapshot(snapshot, user, db)
    return snapshot
