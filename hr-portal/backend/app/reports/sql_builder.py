"""数据集模式的多表 SQL 拼接（spec U4 + KD-1）

输入：
- dataset (DataSet + tables + relations)
- ReportConfig.columns/filters/sorts，列名格式为 "<alias>.<column_code>"
- user（用于注入 scope_filter 与脱敏）

输出：
- columns_meta: 每列 (alias, column_code, label, data_type, is_sensitive) 元数据
- items: 每行 dict（key 是 "<alias>.<column_code>" 命名空间）
- total

实现思路：
- 业务表已经切换为实体列宽表，字段必须指向真实物理列
- SELECT 只取报表需要的实体列与每个 alias 的 id，不再读取整行 raw
- JOIN / 过滤 / 排序都直接使用实体列表达式
- 字段分类脱敏 + 数据范围权限按 alias 对应的 table 各自计算后 AND 进 where
"""
from __future__ import annotations

from datetime import UTC, date, datetime
from decimal import Decimal, InvalidOperation
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import and_, desc, except_, func, inspect, intersect, or_, select, text, true, union
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql import ColumnElement, cast
from sqlalchemy.types import Boolean as SABoolean
from sqlalchemy.types import Date as SADate
from sqlalchemy.types import DateTime as SADateTime
from sqlalchemy.types import Numeric as SANumeric
from sqlalchemy.types import String as SAString

from app.ai_formula.custom_functions import executable_functions
from app.ai_formula.field_refs import row_field_resolver
from app.ai_formula.formula_evaluator import evaluate_formula
from app.data.models import DATA_TABLES, RegisteredTable, TableColumn
from app.datasets.calculated_fields import active_calculated_fields, calc_qual
from app.datasets.metadata import effective_column_label_map
from app.datasets.models import DatasetCalculatedField
from app.datasets.models import DataSet, DataSetRelation, DataSetTable
from app.permissions.strategy import DEFAULT_SCOPE_STRATEGY, normalize_scope_strategy
from app.reports.filter_logic import build_filter_clause
from app.users.models import User


def _table_name(model) -> str:
    return getattr(model, "__tablename__", getattr(model.__table__, "name", "unknown"))


def _ensure_entity_model(model) -> None:
    table_name = _table_name(model)
    if "raw" in model.__table__.columns:
        raise RuntimeError(f"业务表 {table_name} 不是实体列结构，请先重建为实体列业务表")


def _entity_column(model, col_code: str) -> ColumnElement:
    """实体列 SQL 表达式，兼容 SQLAlchemy aliased model。"""
    _ensure_entity_model(model)
    table_name = _table_name(model)
    if col_code not in model.__table__.columns:
        raise RuntimeError(f"业务表 {table_name} 缺少报表实体列: {col_code}")
    return inspect(model).selectable.c[col_code]


def _entity_text(model, col_code: str) -> ColumnElement:
    return cast(_entity_column(model, col_code), SAString)


_TYPE_FAMILY_LABELS = {
    "number": "数字",
    "integer": "数字",
    "date": "日期",
    "datetime": "日期",
}


def _type_family(data_type: str | None) -> str:
    """把字段类型归到「类型族」：数值/日期/文本。仅跨族才需兜底 cast。"""
    key = (data_type or "string").strip().lower()
    if key in {"number", "integer"}:
        return "number"
    if key in {"date", "datetime"}:
        return "date"
    return "text"


def _type_cn(data_type: str | None) -> str:
    return _TYPE_FAMILY_LABELS.get((data_type or "string").strip().lower(), "文本")


def _join_eq(
    lm,
    left_code: str,
    left_type: str | None,
    rm,
    right_code: str,
    right_type: str | None,
    *,
    left_table_label: str,
    right_table_label: str,
    warnings_sink: list[str] | None,
) -> ColumnElement:
    """构造 JOIN 等值条件。两边类型同族直接比较；跨族则统一转文本兜底，并记一条警告。"""
    if _type_family(left_type) == _type_family(right_type):
        return _entity_column(lm, left_code) == _entity_column(rm, right_code)
    if warnings_sink is not None:
        field_desc = left_code if left_code == right_code else f"{left_code} / {right_code}"
        msg = (
            f"数据集关系「{left_table_label} ↔ {right_table_label}」的关联字段 {field_desc} "
            f"两边类型不一致（{_type_cn(left_type)} / {_type_cn(right_type)}），"
            f"已自动按文本兼容比较，可能因格式差异(如前导零)漏匹配，建议在字段管理中统一类型。"
        )
        if msg not in warnings_sink:
            warnings_sink.append(msg)
    return _entity_text(lm, left_code) == _entity_text(rm, right_code)


def _select_label(alias: str, code: str) -> str:
    return f"__{alias}__{code}"


def _calc_field_dangling_dep(field, alias_to_model, columns_by_alias) -> str | None:
    """检测计算字段是否存在悬空依赖（依赖的表/列已不在数据集）。

    返回 None 表示依赖完整；否则返回中文缺失描述，用于警告文案。
    """
    for dep in getattr(field, "depends_on", None) or []:
        if not isinstance(dep, str) or "." not in dep:
            continue
        alias, _, code = dep.partition(".")
        if alias not in alias_to_model:
            return f"依赖的「{alias}」表已不在数据集中"
        cols = columns_by_alias.get(alias, {})
        model = alias_to_model[alias]
        if code not in cols and code not in model.__table__.columns:
            return f"依赖的字段「{alias}.{code}」已不存在"
    return None


def _normalize_report_value(value: Any) -> Any:
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, Decimal):
        return str(value)
    return value


def _coerce_filter_value(value: Any, data_type: str) -> Any:
    if value is None:
        return None
    key = (data_type or "string").strip().lower()
    if key in {"string", "text", "enum"}:
        return str(value)
    if value == "":
        return None
    if key == "number":
        try:
            return Decimal(str(value).replace(",", "").strip())
        except (InvalidOperation, ValueError) as exc:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                detail=f"数值筛选条件无法转换: {value}",
            ) from exc
    if key == "integer":
        try:
            return int(Decimal(str(value).replace(",", "").strip()))
        except (InvalidOperation, ValueError) as exc:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                detail=f"整数筛选条件无法转换: {value}",
            ) from exc
    if key == "date":
        if isinstance(value, date) and not isinstance(value, datetime):
            return value
        text = str(value).strip().replace("/", "-")
        try:
            return date.fromisoformat(text[:10])
        except ValueError as exc:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                detail=f"日期筛选条件无法转换: {value}",
            ) from exc
    if key == "datetime":
        if isinstance(value, datetime):
            return value
        text = str(value).strip().replace("/", "-").replace("T", " ").replace("Z", "+00:00")
        if "+" in text[10:]:
            try:
                return datetime.fromisoformat(text)
            except ValueError:
                pass
        for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d"):
            try:
                width = 19 if " " in fmt else 10
                return datetime.strptime(text[:width], fmt).replace(tzinfo=UTC)
            except ValueError:
                pass
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail=f"日期时间筛选条件无法转换: {value}",
        )
    if key in {"boolean", "bool"}:
        if isinstance(value, bool):
            return value
        text = str(value).strip().lower()
        if text in {"1", "true", "t", "yes", "y", "是", "启用"}:
            return True
        if text in {"0", "false", "f", "no", "n", "否", "停用"}:
            return False
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail=f"布尔筛选条件无法转换: {value}",
        )
    return value


async def _get_dataset_meta(
    dataset_id: int, db: AsyncSession
) -> tuple[DataSet, list[DataSetTable], list[DataSetRelation]]:
    ds = await db.get(DataSet, dataset_id)
    if ds is None:
        raise RuntimeError(f"DataSet {dataset_id} 不存在")
    tables = (
        (await db.execute(select(DataSetTable).where(DataSetTable.dataset_id == dataset_id)))
        .scalars()
        .all()
    )
    rels = (
        (
            await db.execute(
                select(DataSetRelation).where(DataSetRelation.dataset_id == dataset_id)
            )
        )
        .scalars()
        .all()
    )
    return ds, list(tables), list(rels)


async def _get_columns_for_aliases(
    tables: list[DataSetTable], db: AsyncSession
) -> dict[str, list[TableColumn]]:
    """每个 alias → 对应 table 的所有 TableColumn 元数据"""
    by_alias: dict[str, list[TableColumn]] = {}
    for t in tables:
        cols = (
            (
                await db.execute(
                    select(TableColumn)
                    .where(TableColumn.table_name == t.table_name)
                    .order_by(TableColumn.display_order, TableColumn.id)
                )
            )
            .scalars()
            .all()
        )
        by_alias[t.alias] = list(cols)
    return by_alias


async def _table_scope_strategy_map(
    table_names: list[str], db: AsyncSession
) -> dict[str, str]:
    if not table_names:
        return {}
    rows = (
        await db.execute(
            select(RegisteredTable.table_name, RegisteredTable.scope_strategy).where(
                RegisteredTable.table_name.in_(table_names)
            )
        )
    ).all()
    return {name: strategy or DEFAULT_SCOPE_STRATEGY for name, strategy in rows}


def _num(v: Any) -> float:
    """转 float，容忍千分位逗号/首尾空白（如 "1,274.21"）；失败抛 ValueError/TypeError"""
    if isinstance(v, str):
        v = v.replace(",", "").strip()
    return float(v)


def _mul_round2(a: Any, b: Any) -> Any:
    """round(num(a) × num(b), 2)；任一非数值/空 → 空字符串"""
    try:
        return round(_num(a) * _num(b), 2)
    except (TypeError, ValueError):
        return ""


COUNT_AGG_FUNCS = {"count", "count_distinct"}


def _aggregate(values: list, func: str, row_count: int) -> Any:
    """对一组值做聚合：sum/avg/min/max/count/count_distinct；非数值跳过，无数值 → 空"""
    if func == "count":
        return len([v for v in values if v not in (None, "")])
    if func == "count_distinct":
        return len({v for v in values if v not in (None, "")})
    nums: list[float] = []
    for v in values:
        try:
            nums.append(_num(v))
        except (TypeError, ValueError):
            pass
    if not nums:
        return ""
    if func == "avg":
        r = sum(nums) / len(nums)
    elif func == "min":
        r = min(nums)
    elif func == "max":
        r = max(nums)
    else:  # sum
        r = sum(nums)
    return round(r, 2)


def _to_num(v: Any) -> float | None:
    """转数值；非数值/空 → None"""
    if v is None or v == "":
        return None
    try:
        return _num(v)
    except (TypeError, ValueError):
        return None


def _apply_transpose(
    full_items: list[dict[str, Any]],
    selected_quals: list[str],
    dim_quals: list[str],
    mea_quals: list[str],
    rules: list[dict[str, Any]],
    drop_zero_measures: bool,
) -> tuple[list[dict[str, Any]], set[str]]:
    """转置/重映射：把源度量从原维度组合搬到新维度组合，保留其余记录（清零源度量）。

    返回 (结果行, 被删除的全零度量列集合)
    """
    mea_set = set(mea_quals)
    dim_set = set(dim_quals)
    # 清洗规则：source/target 须是度量列；dim_updates 键须是维度列
    clean_rules: list[dict[str, Any]] = []
    for rule in rules or []:
        src = (rule or {}).get("source_col")
        if src not in mea_set:
            continue
        targets = [t for t in (rule.get("target_cols") or []) if t in mea_set]
        if not targets:
            continue
        dim_updates = {
            k: v for k, v in (rule.get("dim_updates") or {}).items() if k in dim_set
        }
        clean_rules.append(
            {"source_col": src, "target_cols": targets, "dim_updates": dim_updates}
        )

    if not clean_rules:
        return full_items, set()

    result: list[dict[str, Any]] = []
    # 收集所有被转置规则搬走的源列（这些列在原行中会被清零）
    transposed_sources: set[str] = {rule["source_col"] for rule in clean_rules}
    for row in full_items:
        # 复制原行（仅已选列），同时保留 __rawprod__ 隐藏键供余差收口用
        factor_extras = {k: v for k, v in row.items() if k.startswith("__rawprod__")}
        base = {q: row.get(q) for q in selected_quals}
        base.update(factor_extras)
        to_zero: set[str] = set()
        for rule in clean_rules:
            val = _to_num(row.get(rule["source_col"]))
            if val is None or val == 0:
                continue
            to_zero.add(rule["source_col"])
            # 新行：复制原行 → 覆盖维度 → 度量全置 0 → 写入目标度量
            new_row = dict(base)
            for dq, nv in rule["dim_updates"].items():
                new_row[dq] = nv
            for mq in mea_quals:
                new_row[mq] = 0
            for tc in rule["target_cols"]:
                new_row[tc] = val
            result.append(new_row)
        # 原行：源度量清零后保留
        kept = dict(base)
        for mq in to_zero:
            kept[mq] = 0
        result.append(kept)

    # 只删除「被转置规则明确搬走后全零」的源列，不误删用户配置的合法零值列
    dropped: set[str] = set()
    if drop_zero_measures:
        for mq in transposed_sources:
            all_zero = True
            for r in result:
                n = _to_num(r.get(mq))
                if n is not None and n != 0:
                    all_zero = False
                    break
            if all_zero:
                dropped.add(mq)
        if dropped:
            for r in result:
                for mq in dropped:
                    r.pop(mq, None)

    return result, dropped


def _conflict_value(values: list[Any], strategy: str) -> Any:
    """Resolve multiple values generated by reshape into one cell."""
    clean = [v for v in values if v not in (None, "")]
    if strategy == "last":
        return clean[-1] if clean else ""
    if strategy == "join":
        return "、".join(str(v) for v in clean)
    if strategy in {"sum", "avg", "min", "max", "count", "count_distinct"}:
        return _aggregate(clean, strategy, len(values))
    return clean[0] if clean else ""


def _meta_by_code(columns_meta: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    return {str(col.get("code")): col for col in columns_meta if col.get("code")}


def _synthetic_meta(
    code: str,
    label: str,
    data_type: str = "string",
    is_sensitive: bool = False,
) -> dict[str, Any]:
    return {
        "code": code,
        "label": label,
        "data_type": data_type,
        "is_sensitive": is_sensitive,
    }


def _apply_column_to_row(
    full_items: list[dict[str, Any]],
    selected_quals: list[str],
    columns_meta: list[dict[str, Any]],
    config: dict[str, Any],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    source_cols = [
        col for col in (config.get("source_cols") or []) if col in selected_quals
    ]
    if not source_cols:
        return full_items, columns_meta

    item_code = "__c2r_item__"
    value_code = "__c2r_value__"
    item_label = config.get("item_label") or "项目"
    value_label = config.get("value_label") or "金额"
    strategy = config.get("conflict_strategy") or "keep_all"
    meta_map = _meta_by_code(columns_meta)
    source_meta = [meta_map.get(col, {}) for col in source_cols]
    value_type = (
        "number"
        if source_meta and all((meta.get("data_type") == "number") for meta in source_meta)
        else "string"
    )
    value_sensitive = any(bool(meta.get("is_sensitive")) for meta in source_meta)
    keep_cols = [col for col in selected_quals if col not in set(source_cols)]

    expanded: list[dict[str, Any]] = []
    for row in full_items:
        base = {col: row.get(col) for col in keep_cols}
        base.update({k: v for k, v in row.items() if k.startswith("__rawprod__")})
        for source_col in source_cols:
            next_row = dict(base)
            next_row[item_code] = meta_map.get(source_col, {}).get("label") or source_col
            next_row[value_code] = row.get(source_col)
            expanded.append(next_row)

    if strategy != "keep_all":
        group_by = [
            col for col in (config.get("group_by") or []) if col in keep_cols
        ]
        groups: dict[tuple, dict[str, Any]] = {}
        order_keys: list[tuple] = []
        for row in expanded:
            key = tuple(row.get(col) for col in group_by) + (row.get(item_code),)
            bucket = groups.get(key)
            if bucket is None:
                bucket = {col: row.get(col) for col in group_by}
                bucket[item_code] = row.get(item_code)
                bucket["__values__"] = []
                groups[key] = bucket
                order_keys.append(key)
            bucket["__values__"].append(row.get(value_code))
        expanded = []
        for key in order_keys:
            bucket = groups[key]
            out = {col: bucket.get(col) for col in group_by}
            out[item_code] = bucket.get(item_code)
            out[value_code] = _conflict_value(bucket.get("__values__") or [], strategy)
            expanded.append(out)
        keep_cols = group_by

    next_meta = [
        meta_map[col]
        for col in keep_cols
        if col in meta_map
    ]
    next_meta.append(_synthetic_meta(item_code, item_label, "string", False))
    next_meta.append(_synthetic_meta(value_code, value_label, value_type, value_sensitive))
    return expanded, next_meta


def _safe_pivot_code(index: int) -> str:
    return f"__r2c_{index + 1}__"


def _apply_row_to_column(
    full_items: list[dict[str, Any]],
    selected_quals: list[str],
    columns_meta: list[dict[str, Any]],
    config: dict[str, Any],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    group_by = [col for col in (config.get("group_by") or []) if col in selected_quals]
    pivot_col = config.get("pivot_col")
    value_col = config.get("value_col")
    if not group_by or pivot_col not in selected_quals or value_col not in selected_quals:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail="行转列需要配置分组维度、列头字段和值字段",
        )

    configured_values = [
        item for item in (config.get("pivot_values") or [])
        if isinstance(item, dict) and item.get("value") not in (None, "")
    ]
    pivot_values: list[dict[str, str]] = []
    seen: set[str] = set()
    if configured_values:
        for item in configured_values:
            key = str(item.get("value"))
            if key in seen:
                continue
            seen.add(key)
            pivot_values.append({"value": key, "label": item.get("label") or key})
    else:
        for row in full_items:
            raw = row.get(pivot_col)
            if raw in (None, ""):
                continue
            key = str(raw)
            if key in seen:
                continue
            seen.add(key)
            pivot_values.append({"value": key, "label": key})

    if not pivot_values:
        meta_map = _meta_by_code(columns_meta)
        return [], [meta_map[col] for col in group_by if col in meta_map]

    strategy = config.get("conflict_strategy") or "first"
    fill_value = config.get("fill_value")
    if fill_value is None:
        fill_value = "--"
    meta_map = _meta_by_code(columns_meta)
    value_meta = meta_map.get(value_col, {})
    value_type = "string" if strategy == "join" else (value_meta.get("data_type") or "string")
    value_sensitive = bool(value_meta.get("is_sensitive"))
    pivot_code_by_value = {
        item["value"]: _safe_pivot_code(i)
        for i, item in enumerate(pivot_values)
    }

    groups: dict[tuple, dict[str, Any]] = {}
    order_keys: list[tuple] = []
    for row in full_items:
        key = tuple(row.get(col) for col in group_by)
        bucket = groups.get(key)
        if bucket is None:
            bucket = {
                "__cells__": {code: [] for code in pivot_code_by_value.values()},
                **{col: row.get(col) for col in group_by},
            }
            groups[key] = bucket
            order_keys.append(key)
        pivot_key = str(row.get(pivot_col)) if row.get(pivot_col) not in (None, "") else ""
        pivot_code = pivot_code_by_value.get(pivot_key)
        if pivot_code:
            bucket["__cells__"][pivot_code].append(row.get(value_col))

    result: list[dict[str, Any]] = []
    for key in order_keys:
        bucket = groups[key]
        out = {col: bucket.get(col) for col in group_by}
        for code in pivot_code_by_value.values():
            values = bucket["__cells__"].get(code) or []
            out[code] = _conflict_value(values, strategy) if values else fill_value
        result.append(out)

    next_meta = [meta_map[col] for col in group_by if col in meta_map]
    for i, item in enumerate(pivot_values):
        next_meta.append(
            _synthetic_meta(_safe_pivot_code(i), item["label"], value_type, value_sensitive)
        )
    return result, next_meta


def _split_qualified(qualified: str) -> tuple[str, str]:
    """'roster.工号' → ('roster', '工号')"""
    if "." not in qualified:
        raise RuntimeError(f"数据集模式下列名必须形如 alias.column，收到: {qualified}")
    alias, _, code = qualified.partition(".")
    return alias, code


def _dedupe_pairs(items: list[tuple[str, str]]) -> list[tuple[str, str]]:
    seen: set[str] = set()
    out: list[tuple[str, str]] = []
    for alias, code in items:
        key = f"{alias}.{code}"
        if key in seen:
            continue
        seen.add(key)
        out.append((alias, code))
    return out


def _calc_role(field: DatasetCalculatedField) -> str:
    return getattr(field, "agg_role", "dimension") or "dimension"


def _calc_field_masked(
    field: DatasetCalculatedField,
    calc_by_code: dict[str, DatasetCalculatedField],
    sensitive_by_alias: dict[str, set[str]],
    alias_columns: dict[str, list[TableColumn]],
    _seen: set[str] | None = None,
) -> bool:
    """计算字段对当前用户是否应脱敏。

    两层裁决（与物理列结构对称）：
    1. field.is_sensitive 为「绝密」强制标记 → 对所有人(含超管)脱敏。
    2. 否则递归依赖：任一物理依赖列对当前用户脱敏 → 整体脱敏。
       物理列脱敏口径复用 col.is_sensitive ∪ get_sensitive_columns(user)（即 sensitive_by_alias，
       已按用户算、超管豁免）。依赖里的 calc.* 下钻其依赖，_seen 防环。
    """
    if field.is_sensitive:
        return True
    seen = _seen if _seen is not None else set()
    seen.add(field.code)
    for dep in field.depends_on or []:
        if not isinstance(dep, str):
            continue
        if dep.startswith("calc."):
            sub = calc_by_code.get(dep[len("calc."):])
            if sub is not None and sub.code not in seen:
                if _calc_field_masked(sub, calc_by_code, sensitive_by_alias, alias_columns, seen):
                    return True
        elif "." in dep:
            alias, _, code = dep.partition(".")
            col = next(
                (c for c in alias_columns.get(alias, []) if c.column_code == code), None
            )
            if col is not None and (
                col.is_sensitive or code in sensitive_by_alias.get(alias, set())
            ):
                return True
    return False


def _row_filter_value_match(value: Any, op: str, expected: Any) -> bool:
    op = (op or "eq").lower()
    if op == "eq":
        return str(value) == str(expected)
    if op == "neq":
        return str(value) != str(expected)
    if op == "contains":
        return str(expected or "") in str(value or "")
    if op in {"gt", "gte", "lt", "lte"}:
        left_num = _to_num(value)
        right_num = _to_num(expected)
        left = left_num if left_num is not None and right_num is not None else str(value or "")
        right = right_num if left_num is not None and right_num is not None else str(expected or "")
        if op == "gt":
            return left > right
        if op == "gte":
            return left >= right
        if op == "lt":
            return left < right
        return left <= right
    if op == "between" and isinstance(expected, (list, tuple)) and len(expected) == 2:
        if expected[0] not in (None, "") and not _row_filter_value_match(value, "gte", expected[0]):
            return False
        if expected[1] not in (None, "") and not _row_filter_value_match(value, "lte", expected[1]):
            return False
        return True
    if op == "in" and isinstance(expected, (list, tuple)):
        return str(value) in {str(v) for v in expected}
    if op == "is_null":
        return value in (None, "")
    if op == "is_not_null":
        return value not in (None, "")
    return True


def _row_matches_filters(
    row: dict[str, Any],
    filters: list[dict[str, Any]],
    filter_logic: dict[str, Any] | None = None,
) -> bool:
    from app.reports.filter_logic import TOKEN_RE, filter_label

    checks: dict[str, bool] = {}
    ordered: list[str] = []
    for i, f in enumerate(filters or []):
        col = f.get("column")
        if not col:
            continue
        label = filter_label(i)
        ordered.append(label)
        checks[label] = _row_filter_value_match(row.get(col), f.get("op") or "eq", f.get("value"))
    if not checks:
        return True
    expression = ""
    if isinstance(filter_logic, dict):
        expression = str(filter_logic.get("expression") or "").strip()
    if not expression:
        return all(checks.values())

    tokens: list[str] = []
    pos = 0
    while pos < len(expression):
        match = TOKEN_RE.match(expression, pos)
        if not match:
            return all(checks.values())
        tokens.append(match.group(1).upper())
        pos = match.end()
    pos_ref = {"pos": 0}
    referenced: set[str] = set()

    def peek() -> str | None:
        return tokens[pos_ref["pos"]] if pos_ref["pos"] < len(tokens) else None

    def take() -> str:
        token = tokens[pos_ref["pos"]]
        pos_ref["pos"] += 1
        return token

    def parse_or() -> bool:
        value = parse_and()
        while peek() == "OR":
            take()
            right = parse_and()
            value = value or right
        return value

    def parse_and() -> bool:
        value = parse_factor()
        while peek() == "AND":
            take()
            right = parse_factor()
            value = value and right
        return value

    def parse_factor() -> bool:
        token = peek()
        if token is None:
            return True
        if token == "(":
            take()
            value = parse_or()
            if peek() == ")":
                take()
            return value
        if token in {"AND", "OR", ")"}:
            take()
            return True
        take()
        label = filter_label(int(token) - 1) if token.isdigit() else token
        referenced.add(label)
        return checks.get(label, True)

    result = parse_or()
    unused = [checks[label] for label in ordered if label not in referenced]
    return result and all(unused)


def _apply_python_sorts(items: list[dict[str, Any]], sorts: list[dict[str, Any]]) -> None:
    for s in reversed(sorts or []):
        cq = s.get("column")
        if not cq:
            continue
        is_desc = (s.get("order") or "asc").lower() == "desc"

        def _k(it, _cq=cq):
            v = it.get(_cq)
            try:
                return (0, float(v))
            except (TypeError, ValueError):
                return (1, str(v) if v is not None else "")

        items.sort(key=_k, reverse=is_desc)


def _project_output_items(
    items: list[dict[str, Any]],
    columns_meta: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    output_codes = [str(col.get("code")) for col in columns_meta if col.get("code")]
    return [{code: row.get(code) for code in output_codes} for row in items]


def _qualified_column_expr(
    qualified: str,
    *,
    aliased_models: dict[str, Any],
) -> ColumnElement:
    if not qualified or "." not in qualified:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail=f"名单回查字段必须形如 alias.column，收到: {qualified}",
        )
    alias, code = _split_qualified(qualified)
    model = aliased_models.get(alias)
    if model is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=f"未知数据集别名: {alias}")
    return _entity_column(model, code)


def _filter_clause_for_aliases(
    filter_item: dict[str, Any],
    *,
    aliased_models: dict[str, Any],
    columns_by_alias: dict[str, dict[str, TableColumn]],
) -> ColumnElement | None:
    col_qual = filter_item.get("column", "")
    if str(col_qual).startswith("calc.") or "." not in str(col_qual):
        return None
    alias, code = _split_qualified(str(col_qual))
    model = aliased_models.get(alias)
    if model is None:
        return None
    col = columns_by_alias.get(alias, {}).get(code)
    expr = _entity_column(model, code)
    data_type = _effective_filter_type(expr, col.data_type if col is not None else "string")
    return _filter_clause(
        expr,
        data_type,
        (filter_item.get("op") or "eq").lower(),
        filter_item.get("value"),
    )


def _column_meta_for_lookup(
    qualified: str,
    *,
    columns_by_alias: dict[str, dict[str, TableColumn]],
) -> TableColumn:
    if not qualified or "." not in qualified:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail=f"名单回查字段必须形如 alias.column，收到: {qualified}",
        )
    alias, code = _split_qualified(qualified)
    col = columns_by_alias.get(alias, {}).get(code)
    if col is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=f"名单回查字段不存在: {qualified}")
    return col


def _lookup_type_key(data_type: str | None) -> str:
    key = (data_type or "string").strip().lower()
    if key in {"string", "text", "enum"}:
        return "string"
    if key in {"number", "numeric", "integer", "int", "float", "decimal"}:
        return "number"
    return key


def _effective_filter_type(expr: ColumnElement, meta_type: str | None) -> str:
    """Prefer the physical SQL column type when metadata is stale."""
    sql_type = getattr(expr, "type", None)
    if isinstance(sql_type, SANumeric):
        return "number"
    if isinstance(sql_type, SADateTime):
        return "datetime"
    if isinstance(sql_type, SADate):
        return "date"
    if isinstance(sql_type, SABoolean):
        return "bool"
    return meta_type or "string"


def _non_empty_expr(expr: ColumnElement) -> ColumnElement:
    return and_(expr.isnot(None), cast(expr, SAString) != "")


def _ensure_lookup_type_match(
    *,
    field: str,
    field_type: str | None,
    expected_field: str,
    expected_type: str | None,
    context: str,
) -> None:
    if _lookup_type_key(field_type) == _lookup_type_key(expected_type):
        return
    raise HTTPException(
        status.HTTP_400_BAD_REQUEST,
        detail=(
            f"{context}字段类型不一致：{field}({field_type or 'string'}) "
            f"不能与 {expected_field}({expected_type or 'string'}) 做名单匹配。"
            "请让所有名单来源返回同一种回查键。"
        ),
    )


def _validate_list_lookup_types(
    list_lookup: dict[str, Any] | None,
    *,
    columns_by_alias: dict[str, dict[str, TableColumn]],
) -> None:
    config = list_lookup or {}
    if not config.get("enabled"):
        return
    lookup = config.get("lookup") or {}
    target_field = lookup.get("target_field") or config.get("target_field")
    if not target_field:
        return
    target_col = _column_meta_for_lookup(str(target_field), columns_by_alias=columns_by_alias)
    target_type = target_col.data_type

    for index, source in enumerate(config.get("sources") or [], start=1):
        if not isinstance(source, dict):
            continue
        source_type = source.get("type") or "filtered_rows"
        if source_type == "field_values":
            source_field = source.get("source_field")
            if not source_field:
                continue
            source_col = _column_meta_for_lookup(str(source_field), columns_by_alias=columns_by_alias)
            resolver = source.get("resolver") or {}
            if resolver.get("enabled", True) and resolver.get("match_field") and resolver.get("return_field"):
                match_col = _column_meta_for_lookup(str(resolver["match_field"]), columns_by_alias=columns_by_alias)
                return_col = _column_meta_for_lookup(str(resolver["return_field"]), columns_by_alias=columns_by_alias)
                _ensure_lookup_type_match(
                    field=str(source_field),
                    field_type=source_col.data_type,
                    expected_field=str(resolver["match_field"]),
                    expected_type=match_col.data_type,
                    context=f"名单回查第 {index} 个来源的抽取字段与匹配字段",
                )
                _ensure_lookup_type_match(
                    field=str(resolver["return_field"]),
                    field_type=return_col.data_type,
                    expected_field=str(target_field),
                    expected_type=target_type,
                    context=f"名单回查第 {index} 个来源的返回字段与回查目标",
                )
            else:
                _ensure_lookup_type_match(
                    field=str(source_field),
                    field_type=source_col.data_type,
                    expected_field=str(target_field),
                    expected_type=target_type,
                    context=f"名单回查第 {index} 个来源的抽取字段与回查目标",
                )
            continue

        if source_type == "filtered_rows":
            return_field = source.get("return_field")
            if not return_field:
                continue
            return_col = _column_meta_for_lookup(str(return_field), columns_by_alias=columns_by_alias)
            _ensure_lookup_type_match(
                field=str(return_field),
                field_type=return_col.data_type,
                expected_field=str(target_field),
                expected_type=target_type,
                context=f"名单回查第 {index} 个来源的返回字段与回查目标",
            )


def _source_key_select(
    source: dict[str, Any],
    *,
    alias_to_model: dict[str, Any],
    columns_by_alias: dict[str, dict[str, TableColumn]],
    index: int,
) -> Any | None:
    from sqlalchemy.orm import aliased

    source_models = {
        alias: aliased(model, name=f"lls_{index}_{alias}")
        for alias, model in alias_to_model.items()
    }
    source_type = source.get("type") or "filtered_rows"
    if source_type == "field_values":
        source_field = source.get("source_field")
        if not source_field:
            return None
        value_expr = _qualified_column_expr(str(source_field), aliased_models=source_models)
        resolver = source.get("resolver") or {}
        if resolver.get("enabled", True) and resolver.get("match_field") and resolver.get("return_field"):
            resolver_models = {
                alias: aliased(model, name=f"llr_{index}_{alias}")
                for alias, model in alias_to_model.items()
            }
            match_expr = _qualified_column_expr(
                str(resolver["match_field"]),
                aliased_models=resolver_models,
            )
            return_expr = _qualified_column_expr(
                str(resolver["return_field"]),
                aliased_models=resolver_models,
            )
            stmt = select(return_expr.label("lookup_key")).where(
                and_(_non_empty_expr(value_expr), match_expr == value_expr)
            )
        else:
            stmt = select(value_expr.label("lookup_key")).where(
                _non_empty_expr(value_expr)
            )
        clause = build_filter_clause(
            source.get("filters") or [],
            lambda item: _filter_clause_for_aliases(
                item,
                aliased_models=source_models,
                columns_by_alias=columns_by_alias,
            ),
            source.get("filter_logic"),
        )
        if clause is not None:
            stmt = stmt.where(clause)
        return stmt.distinct()

    if source_type != "filtered_rows":
        return None
    return_field = source.get("return_field")
    if not return_field:
        return None
    return_expr = _qualified_column_expr(str(return_field), aliased_models=source_models)
    stmt = select(return_expr.label("lookup_key")).where(
        _non_empty_expr(return_expr)
    )
    clause = build_filter_clause(
        source.get("filters") or [],
        lambda item: _filter_clause_for_aliases(
            item,
            aliased_models=source_models,
            columns_by_alias=columns_by_alias,
        ),
        source.get("filter_logic"),
    )
    if clause is not None:
        stmt = stmt.where(clause)
    return stmt.distinct()


def _build_list_lookup_clause(
    list_lookup: dict[str, Any] | None,
    *,
    alias_to_model: dict[str, Any],
    aliased_models: dict[str, Any],
    columns_by_alias: dict[str, dict[str, TableColumn]],
) -> ColumnElement | None:
    config = list_lookup or {}
    if not config.get("enabled"):
        return None
    lookup = config.get("lookup") or {}
    target_field = lookup.get("target_field") or config.get("target_field")
    if not target_field:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="名单回查需要配置回查目标字段")
    target_expr = _qualified_column_expr(str(target_field), aliased_models=aliased_models)
    source_selects = [
        stmt
        for index, source in enumerate(config.get("sources") or [])
        if isinstance(source, dict)
        for stmt in [_source_key_select(
            source,
            alias_to_model=alias_to_model,
            columns_by_alias=columns_by_alias,
            index=index,
        )]
        if stmt is not None
    ]
    if not source_selects:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="名单回查至少需要一个名单来源")

    operator = (config.get("operator") or "union").lower()
    if operator == "intersect":
        set_query = intersect(*source_selects)
    elif operator == "except":
        if len(source_selects) == 1:
            set_query = source_selects[0]
        else:
            set_query = except_(source_selects[0], *source_selects[1:])
    else:
        set_query = union(*source_selects)
    return target_expr.in_(set_query)


def _list_lookup_refs(list_lookup: dict[str, Any] | None) -> list[str]:
    config = list_lookup or {}
    if not config.get("enabled"):
        return []
    refs: list[str] = []
    lookup = config.get("lookup") or {}
    for value in (lookup.get("target_field"), config.get("target_field")):
        if isinstance(value, str) and value:
            refs.append(value)
    for source in config.get("sources") or []:
        if not isinstance(source, dict):
            continue
        for value in (source.get("source_field"), source.get("return_field")):
            if isinstance(value, str) and value:
                refs.append(value)
        resolver = source.get("resolver") or {}
        for value in (resolver.get("match_field"), resolver.get("return_field")):
            if isinstance(value, str) and value:
                refs.append(value)
        for item in source.get("filters") or []:
            value = item.get("column") if isinstance(item, dict) else None
            if isinstance(value, str) and value:
                refs.append(value)
    return refs


def _metric_filter_refs(column_settings: dict[str, Any] | None) -> list[str]:
    refs: list[str] = []
    for setting in (column_settings or {}).values():
        if not isinstance(setting, dict):
            continue
        for item in setting.get("metric_filters") or []:
            value = item.get("column") if isinstance(item, dict) else None
            if isinstance(value, str) and value:
                refs.append(value)
    return refs


async def run_dataset_query(
    dataset_id: int,
    columns: list[str],
    filters: list[dict[str, Any]],
    sorts: list[dict[str, Any]],
    page: int,
    page_size: int,
    user: User | None,
    db: AsyncSession,
    value_rules: list[dict[str, Any]] | None = None,
    aggregate: bool = False,
    aggregations: dict[str, str] | None = None,
    column_settings: dict[str, Any] | None = None,
    transpose: dict[str, Any] | None = None,
    rounding_corrections: list[dict[str, Any]] | None = None,
    filter_logic: dict[str, Any] | None = None,
    list_lookup: dict[str, Any] | None = None,
    scope_strategy: str | None = None,
    warnings_sink: list[str] | None = None,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], int]:
    """执行数据集多表查询

    Returns:
        (columns_meta_list, items, total)
    columns_meta_list: list of dict {alias, column_code, label, data_type, is_sensitive}
    items: list of dict, key = "alias.column_code"
    """
    ds, ds_tables, ds_rels = await _get_dataset_meta(dataset_id, db)
    if not ds_tables:
        return [], [], 0

    alias_to_table = {t.alias: t.table_name for t in ds_tables}
    alias_to_model = {t.alias: DATA_TABLES[t.table_name] for t in ds_tables}
    for alias, model in alias_to_model.items():
        _ensure_entity_model(model)
    alias_columns = await _get_columns_for_aliases(ds_tables, db)
    resolved_scope_strategy = (
        normalize_scope_strategy(scope_strategy)
        if scope_strategy
        else (
            normalize_scope_strategy(ds.scope_strategy)
            if ds.scope_strategy
            else None
        )
    )
    strategy_by_alias: dict[str, str] = {}
    if user is not None:
        table_default_strategies = await _table_scope_strategy_map(
            list({t.table_name for t in ds_tables}), db
        )
        strategy_by_alias = {
            alias: resolved_scope_strategy
            or table_default_strategies.get(table, DEFAULT_SCOPE_STRATEGY)
            for alias, table in alias_to_table.items()
        }
    columns_by_alias = {
        alias: {col.column_code: col for col in cols}
        for alias, cols in alias_columns.items()
    }
    _validate_list_lookup_types(list_lookup, columns_by_alias=columns_by_alias)
    # 关系警告用的友好表名：alias -> registered_tables.table_label，取不到回退表名/alias
    table_label_by_alias: dict[str, str] = {}
    if warnings_sink is not None:
        label_rows = (
            await db.execute(
                select(RegisteredTable.table_name, RegisteredTable.table_label).where(
                    RegisteredTable.table_name.in_(list(alias_to_table.values()))
                )
            )
        ).all()
        label_by_table = {tn: (lbl or tn) for tn, lbl in label_rows}
        table_label_by_alias = {
            alias: label_by_table.get(table, table)
            for alias, table in alias_to_table.items()
        }
    calc_fields = await active_calculated_fields(dataset_id, db)
    calc_by_code = {f.code: f for f in calc_fields}
    calc_by_qual = {calc_qual(f.code): f for f in calc_fields}

    hidden_by_alias: dict[str, set[str]] = {}
    sensitive_by_alias: dict[str, set[str]] = {}
    if user is not None:
        from app.permissions.masker import get_hidden_columns, get_sensitive_columns
        for a, table in alias_to_table.items():
            hidden_by_alias[a] = await get_hidden_columns(user, table, db, tool_key=None)
            sensitive_by_alias[a] = await get_sensitive_columns(user, table, db)

    def _is_hidden_ref(qualified: str) -> bool:
        if "." not in qualified or qualified.startswith("calc."):
            return False
        alias, code = _split_qualified(qualified)
        return code in hidden_by_alias.get(alias, set())

    def _reject_hidden_ref(qualified: str, label: str) -> None:
        if _is_hidden_ref(qualified):
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                detail=f"无权使用{label}: {qualified}",
            )

    # 选定列：未指定则取每张表的可见列
    selected: list[tuple[str, str]] = []
    display_selected: list[tuple[str, str]] = []
    selected_calc_fields: list[DatasetCalculatedField] = []

    # 计算字段悬空依赖检测：依赖的表/列已不在数据集时跳过该字段并记警告
    dangling_calc_codes: set[str] = set()
    for cf in calc_fields:
        miss = _calc_field_dangling_dep(cf, alias_to_model, columns_by_alias)
        if miss:
            dangling_calc_codes.add(cf.code)
            if warnings_sink is not None:
                msg = (
                    f"计算字段「{cf.label or cf.code}」{miss}，已自动跳过。"
                    f"如该字段用于数值拆分或汇总，结果可能受影响，"
                    f"请到数据集修复依赖或删除该计算字段。"
                )
                if msg not in warnings_sink:
                    warnings_sink.append(msg)

    if columns:
        for q in columns:
            if q.startswith("calc."):
                calc_field = calc_by_qual.get(q)
                if calc_field is None:
                    # 计算字段已被删除（不在 active 列表），跳过该列并记警告
                    if warnings_sink is not None:
                        msg = (
                            f"报表引用的计算字段「{q}」已被删除，已自动跳过。"
                            f"如该字段用于数值拆分或汇总，结果可能受影响，"
                            f"请到报表配置中移除该字段引用。"
                        )
                        if msg not in warnings_sink:
                            warnings_sink.append(msg)
                    continue
                if calc_field.code in dangling_calc_codes:
                    continue
                selected_calc_fields.append(calc_field)
            else:
                _reject_hidden_ref(q, "字段")
                pair = _split_qualified(q)
                display_selected.append(pair)
                selected.append(pair)
    else:
        for alias, cols in alias_columns.items():
            for c in cols:
                if c.is_visible and c.column_code not in hidden_by_alias.get(alias, set()):
                    pair = (alias, c.column_code)
                    display_selected.append(pair)
                    selected.append(pair)
        selected_calc_fields = [f for f in calc_fields if f.code not in dangling_calc_codes]

    calc_filter_on = any(str((f or {}).get("column") or "").startswith("calc.") for f in filters or [])
    calc_sort_on = any(str((s or {}).get("column") or "").startswith("calc.") for s in sorts or [])
    calc_rule_quals: set[str] = set()
    for vr in value_rules or []:
        for key in ("target", "factor"):
            raw = (vr or {}).get(key)
            if isinstance(raw, str) and raw.startswith("calc."):
                calc_rule_quals.add(raw)
    internal_calc_fields: list[DatasetCalculatedField] = []
    selected_calc_quals = {calc_qual(f.code) for f in selected_calc_fields}

    def _maybe_add_internal_calc(field) -> None:
        if field and field.code not in dangling_calc_codes and field not in internal_calc_fields:
            internal_calc_fields.append(field)

    for qual in set(selected_calc_quals) | calc_rule_quals:
        _maybe_add_internal_calc(calc_by_qual.get(qual))
    for f in filters or []:
        _maybe_add_internal_calc(calc_by_qual.get(str((f or {}).get("column") or "")))
    for s in sorts or []:
        _maybe_add_internal_calc(calc_by_qual.get(str((s or {}).get("column") or "")))
    for raw in _metric_filter_refs(column_settings):
        _maybe_add_internal_calc(calc_by_qual.get(str(raw or "")))

    for field in internal_calc_fields:
        for dep in field.depends_on or []:
            if isinstance(dep, str) and "." in dep:
                _reject_hidden_ref(dep, "计算字段依赖")
                selected.append(_split_qualified(dep))
    for f in filters or []:
        raw = str((f or {}).get("column") or "")
        if raw and not raw.startswith("calc.") and "." in raw:
            _reject_hidden_ref(raw, "筛选字段")
            selected.append(_split_qualified(raw))
    for s in sorts or []:
        raw = str((s or {}).get("column") or "")
        if raw and not raw.startswith("calc.") and "." in raw:
            _reject_hidden_ref(raw, "排序字段")
            selected.append(_split_qualified(raw))
    for vr in value_rules or []:
        refs: list[str] = [str((vr or {}).get("target") or "")]
        raw_factors = (vr or {}).get("factors")
        if not raw_factors:
            single = (vr or {}).get("factor")
            raw_factors = [single] if single else []
        refs.extend(str(f or "") for f in raw_factors)
        for raw in refs:
            if raw and not raw.startswith("calc.") and "." in raw:
                _reject_hidden_ref(raw, "拆分字段")
                selected.append(_split_qualified(raw))
    for raw in _list_lookup_refs(list_lookup):
        if raw and not raw.startswith("calc.") and "." in raw:
            _reject_hidden_ref(raw, "名单回查字段")
            selected.append(_split_qualified(raw))
    for raw in _metric_filter_refs(column_settings):
        if raw and not raw.startswith("calc.") and "." in raw:
            _reject_hidden_ref(raw, "指标筛选字段")
            selected.append(_split_qualified(raw))
    selected = _dedupe_pairs(selected)

    # 构造 SELECT 列表：每个 alias 取 id，并按需取实体列。
    used_aliases = list({a for a, _ in selected} | {a for a in alias_to_model.keys()})
    # 至少把第一张表 id 作为基准
    primary_alias = ds_tables[0].alias
    primary_model = alias_to_model[primary_alias]

    # SQLAlchemy 对 alias 的 ORM 用法：用 aliased(Model)
    from sqlalchemy.orm import aliased, join as orm_join
    aliased_models: dict[str, Any] = {a: aliased(alias_to_model[a], name=a) for a in used_aliases}

    # 构造 select：把每个 aliased model 的 id 与所需实体列选出来
    select_cols: list[Any] = []
    for a in used_aliases:
        m = aliased_models[a]
        select_cols.append(m.id.label(f"__{a}__id"))
    for a, code in selected:
        if a not in aliased_models:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=f"未知数据集别名: {a}")
        select_cols.append(_entity_column(aliased_models[a], code).label(_select_label(a, code)))

    stmt = select(*select_cols)
    count_stmt = select(func.count()).select_from(aliased_models[primary_alias])

    # FROM = primary_alias, JOIN = relations
    from_clause = aliased_models[primary_alias]
    joined: set[str] = {primary_alias}

    # 简化：按 relations 顺序贪心 JOIN（要求左/右至少一边已经在 joined 里）
    for _ in range(len(ds_rels) + 1):
        progressed = False
        for r in ds_rels:
            if r.left_alias in joined and r.right_alias in joined:
                continue
            if r.left_alias in joined or r.right_alias in joined:
                # 让 known 在左侧
                if r.right_alias in joined:
                    known, new = r.right_alias, r.left_alias
                else:
                    known, new = r.left_alias, r.right_alias
                lm = aliased_models[known]
                rm = aliased_models[new]
                # join 条件
                conds: list[ColumnElement] = []
                for k in r.keys or []:
                    # k.left/k.right 是用户配置的字段名（属于关系定义里 left_alias / right_alias 对应表）
                    left_col = k.get("left")
                    right_col = k.get("right")
                    if known == r.left_alias:
                        # lm=left_alias 表，rm=right_alias 表
                        lt = (columns_by_alias.get(known, {}).get(left_col))
                        rt = (columns_by_alias.get(new, {}).get(right_col))
                        conds.append(
                            _join_eq(
                                lm, left_col, lt.data_type if lt else None,
                                rm, right_col, rt.data_type if rt else None,
                                left_table_label=table_label_by_alias.get(known, known),
                                right_table_label=table_label_by_alias.get(new, new),
                                warnings_sink=warnings_sink,
                            )
                        )
                    else:
                        # lm=right_alias 表，rm=left_alias 表
                        lt = (columns_by_alias.get(known, {}).get(right_col))
                        rt = (columns_by_alias.get(new, {}).get(left_col))
                        conds.append(
                            _join_eq(
                                lm, right_col, lt.data_type if lt else None,
                                rm, left_col, rt.data_type if rt else None,
                                left_table_label=table_label_by_alias.get(known, known),
                                right_table_label=table_label_by_alias.get(new, new),
                                warnings_sink=warnings_sink,
                            )
                        )
                join_cond = and_(*conds) if conds else true()
                join_kind = (r.join_type or "left").lower()
                # 按关系声明的 left/right 语义决定保留哪一侧（与遍历顺序无关）
                if join_kind == "left":
                    keep_left, keep_right = True, False
                elif join_kind == "right":
                    keep_left, keep_right = False, True
                elif join_kind == "full":
                    keep_left, keep_right = True, True
                else:  # inner
                    keep_left, keep_right = False, False
                # 映射到物理两侧：known=已累积的 from_clause，new=新表 rm
                known_is_left = known == r.left_alias
                preserve_known = keep_left if known_is_left else keep_right
                preserve_new = keep_right if known_is_left else keep_left
                # aliased 实体没有 .join，必须用 orm.join() 构造（左侧可为 aliased 实体或已有的 Join）
                if preserve_known and preserve_new:
                    from_clause = orm_join(from_clause, rm, join_cond, isouter=True, full=True)
                elif preserve_known:
                    from_clause = orm_join(from_clause, rm, join_cond, isouter=True)
                elif preserve_new:
                    # 真右外：把要保留的一侧(新表)放到 JOIN 左边，等价于 rm RIGHT JOIN from_clause
                    from_clause = orm_join(rm, from_clause, join_cond, isouter=True)
                else:  # 两侧都不保留 → 内连接
                    from_clause = orm_join(from_clause, rm, join_cond, isouter=False)
                joined.add(new)
                progressed = True
        if not progressed:
            break

    # 没 JOIN 的 alias 视为笛卡尔积（不应发生，spec 要求 UI 阻止）
    if joined != set(used_aliases):
        unjoined = set(used_aliases) - joined
        for a in unjoined:
            from_clause = orm_join(from_clause, aliased_models[a], true(), isouter=False)
            joined.add(a)

    stmt = stmt.select_from(from_clause)
    count_stmt = select(func.count()).select_from(from_clause)

    # 注入数据范围权限（每个 alias 各自算后 AND）
    if user is not None:
        from app.permissions.scope_filter import (
            can_resolve_scope_strategy,
            build_scope_filter,
            is_unrestricted,
        )
        any_strategy_resolved = False
        for a in used_aliases:
            strategy = strategy_by_alias[a]
            if resolved_scope_strategy and not await can_resolve_scope_strategy(
                alias_to_table[a], strategy, db
            ):
                continue
            any_strategy_resolved = True
            clause = await build_scope_filter(user, alias_to_table[a], db, strategy=strategy)
            if not is_unrestricted(clause):
                # build_scope_filter 引用原 Model；报表查询使用 aliased model，
                # 因此按同一权限语义重建一份绑定到当前 alias 的实体列条件。
                clause2 = await _rebuild_scope_filter_for_alias(
                    user, alias_to_table[a], aliased_models[a], db, strategy=strategy
                )
                if clause2 is not None:
                    stmt = stmt.where(clause2)
                    count_stmt = count_stmt.where(clause2)
        if resolved_scope_strategy and not any_strategy_resolved:
            from sqlalchemy import false

            stmt = stmt.where(false())
            count_stmt = count_stmt.where(false())

    # 用户级 filters
    def _dataset_filter_clause(f: dict[str, Any]) -> ColumnElement | None:
        col_qual = f.get("column", "")
        if str(col_qual).startswith("calc."):
            return None
        if "." not in col_qual:
            return None
        a, code = _split_qualified(col_qual)
        if a not in aliased_models:
            return None
        m = aliased_models[a]
        col = columns_by_alias.get(a, {}).get(code)
        data_type = col.data_type if col is not None else "string"
        expr = _entity_column(m, code)
        return _filter_clause(expr, data_type, (f.get("op") or "eq").lower(), f.get("value"))

    try:
        user_clause = None if calc_filter_on else build_filter_clause(
            filters,
            _dataset_filter_clause,
            filter_logic,
        )
    except ValueError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    if user_clause is not None:
        stmt = stmt.where(user_clause)
        count_stmt = count_stmt.where(user_clause)

    list_lookup_clause = _build_list_lookup_clause(
        list_lookup,
        alias_to_model=alias_to_model,
        aliased_models=aliased_models,
        columns_by_alias=columns_by_alias,
    )
    if list_lookup_clause is not None:
        stmt = stmt.where(list_lookup_clause)
        count_stmt = count_stmt.where(list_lookup_clause)

    # 排序
    sql_sort_applied = False
    for s in sorts:
        col_qual = s.get("column", "")
        if str(col_qual).startswith("calc."):
            continue
        if "." not in col_qual:
            continue
        a, code = _split_qualified(col_qual)
        if a not in aliased_models:
            continue
        m = aliased_models[a]
        order = (s.get("order") or "asc").lower()
        col_expr = _entity_column(m, code)
        stmt = stmt.order_by(desc(col_expr) if order == "desc" else col_expr)
        sql_sort_applied = True

    if not sql_sort_applied:
        stmt = stmt.order_by(desc(aliased_models[primary_alias].id))

    # 维度/度量（来自字段管理的 agg_role）+ 是否聚合
    def _role(alias: str, code: str) -> str:
        if alias == "calc":
            field = calc_by_code.get(code)
            return _calc_role(field) if field else "dimension"
        col = next(
            (c for c in alias_columns.get(alias, []) if c.column_code == code), None
        )
        return getattr(col, "agg_role", "dimension") if col else "dimension"

    def _explicit_count_metric(qual: str) -> bool:
        return (aggregations or {}).get(qual) in COUNT_AGG_FUNCS

    output_pairs = display_selected + [("calc", f.code) for f in selected_calc_fields]
    dim_quals = [
        f"{a}.{c}"
        for (a, c) in output_pairs
        if _role(a, c) == "dimension" and not _explicit_count_metric(f"{a}.{c}")
    ]
    mea_quals = [
        f"{a}.{c}"
        for (a, c) in output_pairs
        if _role(a, c) == "measure" or _explicit_count_metric(f"{a}.{c}")
    ]
    agg_on = bool(aggregate) and len(mea_quals) > 0
    transpose_rules = (transpose or {}).get("rules") or []
    transpose_enabled = bool((transpose or {}).get("enabled"))
    transpose_on = transpose_enabled and len(transpose_rules) > 0
    column_to_row_cfg = (transpose or {}).get("column_to_row") or {}
    row_to_column_cfg = (transpose or {}).get("row_to_column") or {}
    column_to_row_on = transpose_enabled and bool(column_to_row_cfg.get("enabled"))
    row_to_column_on = transpose_enabled and bool(row_to_column_cfg.get("enabled"))
    if column_to_row_on and row_to_column_on:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail="列转行和行转列不能同时启用，请拆成两个报表步骤处理",
        )
    structural_reshape_on = column_to_row_on or row_to_column_on

    # 取数：聚合/转置要增删行，须取全量后 Python 分页；明细模式 SQL 分页
    need_all = agg_on or transpose_on or structural_reshape_on or calc_filter_on or calc_sort_on
    total = 0
    if need_all:
        # 全量取数前设置 statement_timeout，防止超大数据量挂死连接
        await db.execute(text("SET LOCAL statement_timeout = '120s'"))
        rows = (await db.execute(stmt)).all()
        await db.execute(text("SET LOCAL statement_timeout = '0'"))
    else:
        total = (await db.execute(count_stmt)).scalar_one()
        if page_size > 0:
            stmt = stmt.offset((page - 1) * page_size).limit(page_size)
        rows = (await db.execute(stmt)).all()

    # ===== 列元数据 =====
    # 按 columns 里的原始顺序遍历，物理列和计算字段混排，保留拖动后的顺序。
    columns_meta: list[dict[str, Any]] = []
    labels_by_alias = {
        alias: await effective_column_label_map(cols, db)
        for alias, cols in alias_columns.items()
    }

    # 预计算每个计算字段对当前用户是否脱敏（绝密强制 ∪ 递归依赖授权裁决）
    calc_masked: dict[str, bool] = {
        field.code: _calc_field_masked(
            field, calc_by_code, sensitive_by_alias, alias_columns
        )
        for field in selected_calc_fields
    }

    selected_calc_codes = {calc_qual(f.code): f for f in selected_calc_fields}
    display_selected_set = {f"{a}.{c}" for a, c in display_selected}

    for q in (columns if columns else [f"{a}.{c}" for a, c in display_selected] + [calc_qual(f.code) for f in selected_calc_fields]):
        if q.startswith("calc."):
            field = selected_calc_codes.get(q)
            if field is None:
                continue
            columns_meta.append(
                {
                    "code": calc_qual(field.code),
                    "label": field.label,
                    "data_type": field.data_type,
                    "is_sensitive": calc_masked.get(field.code, False),
                }
            )
        else:
            if q not in display_selected_set:
                continue
            alias, code = _split_qualified(q)
            col = next(
                (c for c in alias_columns.get(alias, []) if c.column_code == code), None
            )
            if col is None:
                columns_meta.append(
                    {
                        "code": f"{alias}.{code}",
                        "label": code,
                        "data_type": "string",
                        "is_sensitive": False,
                    }
                )
            else:
                mask = col.is_sensitive or (
                    code in sensitive_by_alias.get(alias, set())
                )
                columns_meta.append(
                    {
                        "code": f"{alias}.{code}",
                        "label": labels_by_alias.get(alias, {}).get(
                            code, col.column_label or col.column_code
                        ),
                        "data_type": col.data_type,
                        "is_sensitive": mask,
                    }
                )

    # ===== 行数据 =====
    # 数值拆分规则：target 列出值 = round(num(target) × ∏ num(factor_i), 2)，非数值/空 → 空
    rules_by_target: dict[str, list[str]] = {}
    for vr in (value_rules or []):
        t = (vr or {}).get("target")
        # 兼容旧单系数字段 factor；新字段 factors 为数组
        raw_factors = (vr or {}).get("factors")
        if not raw_factors:
            single = (vr or {}).get("factor")
            raw_factors = [single] if single else []
        factors = [f for f in raw_factors if isinstance(f, str) and "." in f]
        if t and factors and "." in t:
            rules_by_target[t] = factors

    full_items: list[dict[str, Any]] = []
    from app.core.db import get_session_factory
    async with get_session_factory()() as fn_db:
        custom_functions = await executable_functions(fn_db)
    for r in rows:
        d = r._mapping if hasattr(r, "_mapping") else dict(zip(r.keys(), r))
        item: dict[str, Any] = {}
        formula_item: dict[str, Any] = {}
        for alias, code in selected:
            qual = f"{alias}.{code}"
            raw_value = d.get(_select_label(alias, code))
            formula_item[qual] = raw_value
            v = _normalize_report_value(raw_value)
            sens = sensitive_by_alias.get(alias, set())
            col = next(
                (c for c in alias_columns.get(alias, []) if c.column_code == code), None
            )
            masked = col is not None and (col.is_sensitive or code in sens)
            if masked:
                if v not in (None, ""):
                    v = "******"
            else:
                # 行级连乘系数：round(target × ∏ factor_i, 2)；同时存未取整乘积供余差收口用
                # 仅当所有系数均为物理列时在此阶段计算；含 calc 系数则留到下方第二阶段
                factor_quals = rules_by_target.get(qual)
                if factor_quals and not any(fq.startswith("calc.") for fq in factor_quals):
                    try:
                        raw_prod = _num(raw_value)
                        for fq in factor_quals:
                            fa, _, fc = fq.partition(".")
                            raw_prod = raw_prod * _num(d.get(_select_label(fa, fc)))
                        item[f"__rawprod__{qual}"] = raw_prod  # 未取整，用于余差收口
                        v = round(raw_prod, 2)
                    except (TypeError, ValueError):
                        v = ""
            item[qual] = v
        for field in internal_calc_fields:
            qual = calc_qual(field.code)
            value = evaluate_formula(
                field.formula,
                field_resolver=row_field_resolver(formula_item),
                custom_functions=custom_functions,
            )
            formula_item[qual] = value  # 供下游计算字段引用，始终用真实值
            if calc_masked.get(field.code) and value not in (None, ""):
                value = "******"
            item[qual] = value
        for target_qual, factor_quals in rules_by_target.items():
            if not (target_qual.startswith("calc.") or any(fq.startswith("calc.") for fq in factor_quals)):
                continue
            if target_qual not in item:
                continue
            try:
                raw_prod = _num(item.get(target_qual))
                for fq in factor_quals:
                    # 取系数时用原始未乘值，避免第一阶段已乘系数的字段被二次放大
                    if not fq.startswith("calc."):
                        fa, _, fc = fq.partition(".")
                        factor_val = d.get(_select_label(fa, fc))
                    else:
                        factor_val = item.get(fq)
                    raw_prod = raw_prod * _num(factor_val)
                item[f"__rawprod__{target_qual}"] = raw_prod
                item[target_qual] = round(raw_prod, 2)
            except (TypeError, ValueError):
                item[target_qual] = ""
        if calc_filter_on and not _row_matches_filters(formula_item, filters, filter_logic):
            continue
        full_items.append(item)

    # ===== 转置/重映射（先拆分，已在上面完成）→ 行重塑 → 再聚合 =====
    if transpose_on:
        selected_quals = [cm["code"] for cm in columns_meta]
        full_items, dropped = _apply_transpose(
            full_items,
            selected_quals,
            dim_quals,
            mea_quals,
            transpose_rules,
            bool((transpose or {}).get("drop_zero_measures", True)),
        )
        if dropped:
            columns_meta = [cm for cm in columns_meta if cm["code"] not in dropped]
            mea_quals = [m for m in mea_quals if m not in dropped]

    if column_to_row_on:
        selected_quals = [cm["code"] for cm in columns_meta]
        full_items, columns_meta = _apply_column_to_row(
            full_items,
            selected_quals,
            columns_meta,
            column_to_row_cfg,
        )
        total = len(full_items)
        if page_size > 0:
            full_items = full_items[(page - 1) * page_size: page * page_size]
        full_items = _project_output_items(full_items, columns_meta)
        return columns_meta, full_items, total

    if row_to_column_on:
        selected_quals = [cm["code"] for cm in columns_meta]
        full_items, columns_meta = _apply_row_to_column(
            full_items,
            selected_quals,
            columns_meta,
            row_to_column_cfg,
        )
        total = len(full_items)
        if page_size > 0:
            full_items = full_items[(page - 1) * page_size: page * page_size]
        full_items = _project_output_items(full_items, columns_meta)
        return columns_meta, full_items, total

    if not agg_on:
        if calc_sort_on:
            _apply_python_sorts(full_items, sorts)
        if need_all:
            total = len(full_items)
            if page_size > 0:
                full_items = full_items[(page - 1) * page_size: page * page_size]
        full_items = _project_output_items(full_items, columns_meta)
        return columns_meta, full_items, total

    # ===== 聚合：先拆分（已在上面完成）→ 按维度分组 → 度量聚合 =====
    groups: dict[tuple, dict] = {}
    order_keys: list[tuple] = []
    for it in full_items:
        key = tuple(it.get(dq) for dq in dim_quals)
        g = groups.get(key)
        if g is None:
            g = {dq: it.get(dq) for dq in dim_quals}
            g["__rows__"] = []
            groups[key] = g
            order_keys.append(key)
        groups[key]["__rows__"].append(it)

    result: list[dict[str, Any]] = []
    for key in order_keys:
        g = groups[key]
        out = {dq: g[dq] for dq in dim_quals}
        rws = g["__rows__"]
        for mq in mea_quals:
            agg_fn = (aggregations or {}).get(mq, "sum")
            setting = (column_settings or {}).get(mq) or {}
            metric_filters = setting.get("metric_filters") or []
            metric_filter_logic = setting.get("metric_filter_logic")
            filtered_rows = [
                rw for rw in rws
                if _row_matches_filters(rw, metric_filters, metric_filter_logic)
            ]
            out[mq] = _aggregate([rw.get(mq) for rw in filtered_rows], agg_fn, len(filtered_rows))
        result.append(out)

    # ===== 余差收口：同组末行补差值，确保合计 = sum(rawprod) 取整 =====
    for rc in (rounding_corrections or []):
        group_by = rc.get("group_by")
        group_cols = group_by if isinstance(group_by, list) else ([group_by] if group_by else [])
        target_cols = rc.get("target_cols") or []
        if not group_cols or not target_cols:
            continue
        # 按 group_cols 把 result 分组
        rc_groups: dict[tuple, list[dict]] = {}
        rc_order: list[tuple] = []
        for row in result:
            gk = tuple(row.get(col) for col in group_cols)
            if gk not in rc_groups:
                rc_groups[gk] = []
                rc_order.append(gk)
            rc_groups[gk].append(row)
        # 期望合计 = sum(未取整乘积) 再 round(2)
        expected_sums: dict[tuple, dict[str, float]] = {}
        for raw_row in full_items:
            gk = tuple(raw_row.get(col) for col in group_cols)
            if gk not in expected_sums:
                expected_sums[gk] = {}
            for tc in target_cols:
                rp = raw_row.get(f"__rawprod__{tc}")
                if rp is None:
                    # 无系数规则的列，直接用已取整值
                    rp = _to_num(raw_row.get(tc))
                if rp is None:
                    continue
                expected_sums[gk][tc] = expected_sums[gk].get(tc, 0.0) + rp
        # 对每组补差：余差落在该列「非空且 ≠0」的最后一行；整组该列无数则不补
        for gk in rc_order:
            rows_in_group = rc_groups[gk]
            for tc in target_cols:
                raw_sum = expected_sums.get(gk, {}).get(tc)
                if raw_sum is None:
                    continue
                expected = round(raw_sum, 2)
                actual_sum = round(sum(_to_num(row.get(tc)) or 0.0 for row in rows_in_group), 2)
                diff = round(expected - actual_sum, 2)
                if diff == 0:
                    continue
                # 倒序找该列最后一个有数（非空且 ≠0）的行
                target_row = None
                for row in reversed(rows_in_group):
                    n = _to_num(row.get(tc))
                    if n is not None and n != 0:
                        target_row = row
                        break
                if target_row is None:
                    continue
                cur = _to_num(target_row.get(tc)) or 0.0
                target_row[tc] = round(cur + diff, 2)

    # Python 端排序（聚合结果上）
    for s in reversed(sorts or []):
        cq = s.get("column")
        if not cq:
            continue
        is_desc = (s.get("order") or "asc").lower() == "desc"

        def _k(it, _cq=cq):
            v = it.get(_cq)
            try:
                return (0, float(v))
            except (TypeError, ValueError):
                return (1, str(v) if v is not None else "")

        result.sort(key=_k, reverse=is_desc)

    total = len(result)
    if page_size > 0:
        items = result[(page - 1) * page_size: page * page_size]
    else:
        items = result
    items = _project_output_items(items, columns_meta)
    return columns_meta, items, total


def _filter_clause(expr, data_type: str, op: str, val: Any) -> ColumnElement | None:
    if op == "eq":
        return expr == _coerce_filter_value(val, data_type)
    if op == "neq":
        return expr != _coerce_filter_value(val, data_type)
    if op == "contains" and val:
        return cast(expr, SAString).ilike(f"%{val}%")
    if op == "gt":
        return expr > _coerce_filter_value(val, data_type)
    if op == "gte":
        return expr >= _coerce_filter_value(val, data_type)
    if op == "lt":
        return expr < _coerce_filter_value(val, data_type)
    if op == "lte":
        return expr <= _coerce_filter_value(val, data_type)
    if op == "between" and isinstance(val, (list, tuple)) and len(val) == 2:
        clauses = []
        if val[0] not in (None, ""):
            clauses.append(expr >= _coerce_filter_value(val[0], data_type))
        if val[1] not in (None, ""):
            clauses.append(expr <= _coerce_filter_value(val[1], data_type))
        return and_(*clauses) if clauses else None
    if op == "in" and isinstance(val, (list, tuple)) and val:
        return expr.in_([_coerce_filter_value(x, data_type) for x in val])
    if op == "is_null":
        return or_(expr.is_(None), cast(expr, SAString) == "")
    if op == "is_not_null":
        return and_(expr.isnot(None), cast(expr, SAString) != "")
    return None


async def _rebuild_scope_filter_for_alias(
    user: User,
    table: str,
    aliased_model,
    db: AsyncSession,
    strategy: str | None = DEFAULT_SCOPE_STRATEGY,
) -> ColumnElement | None:
    """复用 scope_filter 的语义，但 Model 换成 aliased。

    返回值：
    - None      → 不约束（超管等）
    - false()   → 用户无权限（无标签）
    - 其它      → 拼接到 where 的 ColumnElement
    """
    from app.permissions.scope_filter import _build_scope_filter_for_model, is_unrestricted

    clause = await _build_scope_filter_for_model(
        user,
        table,
        aliased_model,
        db,
        strategy=strategy,
    )
    return None if is_unrestricted(clause) else clause
