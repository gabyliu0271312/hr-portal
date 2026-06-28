"""CompareSpec deterministic normalizer.

The LLM only needs to produce a rough CompareSpec draft from natural language.
This module owns stable backend rules:
- normalize month/period expressions to YYYYMM;
- fill source.period for monthly tables and keep period columns out of join_keys;
- infer/correct join_keys from registered metadata;
- add safe defaults for roster/output.

It never generates or executes SQL.
"""
from __future__ import annotations

import copy
import re
from datetime import date
from typing import Any

from pydantic import ValidationError as PydanticValidationError

from app.data_compare.metadata import MetadataLoader, TableMeta
from app.data_compare.schemas import CompareSpec, CompareType


EMPLOYEE_KEY_CANDIDATES = (
    "employee_no",
    "employee_id",
    "staff_no",
    "emp_no",
    "person_no",
    "user_no",
)

PERIOD_COLUMN_CANDIDATES = {
    "period",
    "period_ym",
    "month",
    "month_id",
    "pay_month",
    "cost_period",
    "salary_month",
    "biz_month",
}

DISPLAY_METRIC_KEYWORDS = {
    "diff_count": ("差异", "异常", "不一致"),
    "only_in_a_count": ("仅a", "仅A", "只在a", "只在A", "a有", "A有", "a表", "A表"),
    "only_in_b_count": ("仅b", "仅B", "只在b", "只在B", "b有", "B有", "b表", "B表"),
    "amount_diff": ("差额", "金额差", "差异金额"),
}


def normalize_period_text(value: Any, *, today: date | None = None) -> str | None:
    """Normalize common month expressions to YYYYMM.

    Supports examples: 202605, 2026.05, 2026-05, 2026/05,
    2026?5?, 2026?05??, 5?.
    """
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None

    # Already YYYYMM.
    m = re.search(r"(?<!\d)((?:19|20)\d{2})(0[1-9]|1[0-2])(?!\d)", text)
    if m:
        return f"{m.group(1)}{m.group(2)}"

    # YYYY[?./_-]M[M][?/??].
    m = re.search(
        r"((?:19|20)\d{2})\s*(?:\u5e74|[./_-])\s*(0?[1-9]|1[0-2])\s*(?:\u6708|\u6708\u4efd)?",
        text,
    )
    if m:
        return f"{m.group(1)}{int(m.group(2)):02d}"

    # M[M]?: deterministic fallback to current year.
    m = re.search(r"(?<!\d)(0?[1-9]|1[0-2])\s*(?:\u6708|\u6708\u4efd)", text)
    if m:
        base = today or date.today()
        return f"{base.year}{int(m.group(1)):02d}"

    return None


def extract_period_from_instruction(instruction: str, *, today: date | None = None) -> str | None:
    return normalize_period_text(instruction, today=today)


def _source_dict(data: dict[str, Any], key: str) -> dict[str, Any]:
    value = data.get(key)
    if isinstance(value, dict):
        value.setdefault("prefilter", [])
        return value
    value = {"table": "", "period": None, "prefilter": []}
    data[key] = value
    return value


def _remove_period_prefilters(source: dict[str, Any], meta: TableMeta | None, *, today: date | None = None) -> None:
    """Move period prefilters to source.period and remove them from prefilter."""
    if meta is None or not meta.is_period:
        return
    period_cols = {c for c in (meta.period_col, "period") if c}
    cleaned: list[Any] = []
    for pf in source.get("prefilter") or []:
        if not isinstance(pf, dict):
            cleaned.append(pf)
            continue
        if pf.get("column") in period_cols:
            period = normalize_period_text(pf.get("value"), today=today)
            if period:
                source["period"] = period
            continue
        cleaned.append(pf)
    source["prefilter"] = cleaned


def _common_pk_keys(meta_a: TableMeta, meta_b: TableMeta) -> list[str]:
    pks_a = [c.column_code for c in meta_a.columns.values() if c.is_pk_part]
    pks_b = {c.column_code for c in meta_b.columns.values() if c.is_pk_part}
    return [c for c in pks_a if c in pks_b]


def infer_join_keys(meta_a: TableMeta, meta_b: TableMeta) -> list[str]:
    """Infer join keys from metadata with deterministic precedence."""
    common_cols = set(meta_a.columns).intersection(meta_b.columns)

    common_pk = _common_pk_keys(meta_a, meta_b)
    if common_pk:
        return common_pk

    for candidate in EMPLOYEE_KEY_CANDIDATES:
        if candidate in common_cols:
            return [candidate]

    for candidate in (meta_a.join_col, meta_b.join_col):
        if candidate and candidate in common_cols:
            return [candidate]

    return []


def _period_cols(meta_a: TableMeta | None, meta_b: TableMeta | None) -> set[str]:
    cols = set(PERIOD_COLUMN_CANDIDATES)
    if meta_a and meta_a.period_col:
        cols.add(meta_a.period_col)
    if meta_b and meta_b.period_col:
        cols.add(meta_b.period_col)
    return cols


def _normalize_join_keys(raw_keys: Any, meta_a: TableMeta | None, meta_b: TableMeta | None) -> list[str]:
    keys = [str(k).strip() for k in (raw_keys or []) if str(k or "").strip()]
    if meta_a is None or meta_b is None:
        return keys

    # Period columns are filters, not entity identity keys. Different period_col
    # names across tables are handled by templates via source.period.
    period_cols = _period_cols(meta_a, meta_b)
    keys = [k for k in keys if k not in period_cols]

    # Keep only keys that exist on both sides; otherwise infer or let validation fail.
    keys = [k for k in keys if k in meta_a.columns and k in meta_b.columns]
    return keys or infer_join_keys(meta_a, meta_b)


def _safe_display_fields(meta_a: TableMeta | None, meta_b: TableMeta | None, join_keys: list[str]) -> list[str]:
    fields: list[str] = []
    for key in join_keys:
        if key and key not in fields:
            fields.append(key)
    for candidate in ("employee_name", "full_name", "chinese_name", "name"):
        if (
            (meta_a and candidate in meta_a.columns)
            or (meta_b and candidate in meta_b.columns)
        ) and candidate not in fields:
            fields.append(candidate)
    return fields or ["employee_no"]


def _compare_type_value(value: Any) -> str | None:
    if isinstance(value, CompareType):
        return value.value
    if value is None:
        return None
    return str(value)


def _instruction_mentions_any(instruction: str, words: tuple[str, ...]) -> bool:
    return any(w in instruction for w in words)


def _columns_from_instruction(
    instruction: str,
    meta_a: TableMeta | None,
    meta_b: TableMeta | None,
) -> list[str]:
    """Infer display columns explicitly mentioned by the user's instruction."""
    cols: list[str] = []
    all_cols: dict[str, str] = {}
    for meta in (meta_a, meta_b):
        if not meta:
            continue
        for code, col in meta.columns.items():
            all_cols[code] = col.column_label or code

    for code, label in all_cols.items():
        if code in instruction or (label and label in instruction):
            if code not in cols:
                cols.append(code)
    return cols


def _default_display_config(
    *,
    compare_type: str | None,
    instruction: str,
    join_keys: list[str],
    meta_a: TableMeta | None,
    meta_b: TableMeta | None,
    existing: dict[str, Any],
) -> dict[str, Any]:
    display = dict(existing or {})
    template = display.get("template") or "auto"
    if template == "auto" and compare_type in {"roster", "field", "amount"}:
        template = compare_type
    display["template"] = template

    mentioned_cols = _columns_from_instruction(instruction, meta_a, meta_b)

    if compare_type == CompareType.ROSTER.value:
        default_cols = [*join_keys, "employee_name", "diff_type"]
        display.setdefault("primary_metric", "diff_count")
        display.setdefault("title", "名单对比结果")
    elif compare_type == CompareType.FIELD.value:
        default_cols = [*join_keys, "field", "field_a", "field_b", "diff_type", "status"]
        display.setdefault("primary_metric", "diff_count")
        display.setdefault("title", "字段对比结果")
    elif compare_type == CompareType.AMOUNT.value:
        default_cols = [*join_keys, "amount_a", "amount_b", "diff", "status"]
        display.setdefault("primary_metric", "amount_diff")
        display.setdefault("title", "金额对比结果")
    else:
        default_cols = [*join_keys, "diff_type", "status"]

    columns = [str(c) for c in display.get("columns") or [] if str(c or "").strip()]
    if not columns:
        columns = [*mentioned_cols, *default_cols]
    # Keep stable unique order
    seen: set[str] = set()
    display["columns"] = [c for c in columns if not (c in seen or seen.add(c))]

    hidden = [str(c) for c in display.get("hidden_columns") or [] if str(c or "").strip()]
    display["hidden_columns"] = list(dict.fromkeys(hidden))

    highlights = [str(c) for c in display.get("highlight_columns") or [] if str(c or "").strip()]
    if compare_type == CompareType.ROSTER.value:
        highlights.extend(["diff_type"])
    elif compare_type == CompareType.FIELD.value:
        highlights.extend(["field", "field_a", "field_b"])
    elif compare_type == CompareType.AMOUNT.value:
        highlights.extend(["diff", "amount_a", "amount_b"])
    for c in mentioned_cols:
        highlights.append(c)
    display["highlight_columns"] = list(dict.fromkeys(highlights))

    if not display.get("sort_by"):
        if _instruction_mentions_any(instruction, ("排序", "降序", "从高到低", "最大", "差额")):
            display["sort_by"] = "diff" if compare_type == CompareType.AMOUNT.value else "diff_type"
            display["sort_order"] = "desc"
    display.setdefault("sort_order", "desc")
    display.setdefault("show_context", True)
    display.setdefault("show_explanation", True)

    for metric, words in DISPLAY_METRIC_KEYWORDS.items():
        if _instruction_mentions_any(instruction, words):
            display["primary_metric"] = metric
            break

    return display


async def normalize_compare_spec_data(
    data: dict[str, Any],
    loader: MetadataLoader,
    *,
    instruction: str | None = None,
    today: date | None = None,
) -> dict[str, Any]:
    """Return a normalized CompareSpec dict ready for Pydantic validation."""
    normalized = copy.deepcopy(data or {})

    source_a = _source_dict(normalized, "source_a")
    source_b = _source_dict(normalized, "source_b")

    meta_a = await loader.get_table(source_a.get("table") or "")
    meta_b = await loader.get_table(source_b.get("table") or "")

    instruction_period = extract_period_from_instruction(instruction or "", today=today)

    for source, meta in ((source_a, meta_a), (source_b, meta_b)):
        _remove_period_prefilters(source, meta, today=today)
        source_period = normalize_period_text(source.get("period"), today=today)
        if source_period:
            source["period"] = source_period
        elif meta and meta.is_period and instruction_period:
            source["period"] = instruction_period
        elif meta and not meta.is_period:
            source["period"] = None
        source.setdefault("prefilter", [])

    join_keys = _normalize_join_keys(normalized.get("join_keys"), meta_a, meta_b)
    if join_keys:
        normalized["join_keys"] = join_keys

    output = normalized.get("output") if isinstance(normalized.get("output"), dict) else {}
    output.setdefault("only_diff", True)
    output.setdefault("max_detail", 200)
    normalized["output"] = output

    compare_type = _compare_type_value(normalized.get("compare_type"))
    display = normalized.get("display") if isinstance(normalized.get("display"), dict) else {}
    normalized["display"] = _default_display_config(
        compare_type=compare_type,
        instruction=instruction or "",
        join_keys=join_keys,
        meta_a=meta_a,
        meta_b=meta_b,
        existing=display,
    )

    if compare_type == CompareType.ROSTER.value:
        roster = normalized.get("roster") if isinstance(normalized.get("roster"), dict) else {}
        roster.setdefault("direction", "both")
        if not roster.get("display_fields"):
            roster["display_fields"] = _safe_display_fields(meta_a, meta_b, join_keys)
        normalized["roster"] = roster
        normalized.setdefault("field", None)
        normalized.setdefault("amount", None)
    elif compare_type == CompareType.FIELD.value:
        normalized.setdefault("roster", None)
        normalized.setdefault("amount", None)
    elif compare_type == CompareType.AMOUNT.value:
        normalized.setdefault("roster", None)
        normalized.setdefault("field", None)

    return normalized


async def normalize_compare_spec(
    spec_or_data: CompareSpec | dict[str, Any],
    loader: MetadataLoader,
    *,
    instruction: str | None = None,
    today: date | None = None,
) -> CompareSpec:
    data = spec_or_data.model_dump() if isinstance(spec_or_data, CompareSpec) else spec_or_data
    normalized = await normalize_compare_spec_data(data, loader, instruction=instruction, today=today)
    try:
        return CompareSpec.model_validate(normalized)
    except PydanticValidationError:
        # Preserve Pydantic's detailed error for callers.
        raise
