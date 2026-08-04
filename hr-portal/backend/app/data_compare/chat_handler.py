"""data_compare ChatRoute — LLM extractor + handler。

extractor: LLM 解析用户自然语言 → CompareSpec JSON（不生成 SQL）
handler: CompareSpec → Scope → MetadataLoader → SchemaValidator → TemplateEngine → Executor → Formatter
"""
from __future__ import annotations

import json
import time

from pydantic import ValidationError as PydanticValidationError

from app.data_compare.engine import compile_query
from app.data_compare.executor import execute_compare, build_scope_for_compare, ScopeDeniedError
from app.data_compare.formatter import format_result
from app.data_compare.metadata import MetadataLoader
from app.data_compare.schemas import CompareSpec, CompareType
from app.data_compare.normalizer import normalize_compare_spec, normalize_compare_spec_data
from app.data_compare.validator import validate_compare_spec, SchemaValidationError


async def extract_compare_spec(
    user_message: str,
    loader: MetadataLoader,
    model_call: callable,  # async fn(prompt: str) -> str
) -> CompareSpec:
    """调用 LLM 从自然语言提取 CompareSpec JSON。

    Args:
        user_message: 用户原始自然语言描述
        loader: 已加载表结构的 MetadataLoader
        model_call: LLM 调用函数，接受 prompt 字符串，返回模型响应字符串

    Returns:
        校验通过的 CompareSpec
    """
    # 构建表结构清单
    tables = await loader.list_tables()
    table_desc_lines: list[str] = []
    for t in tables:
        cols = ", ".join(
            f"{c.column_code}({c.data_type}{'[PK]' if c.is_pk_part else ''})"
            for c in t.columns.values()
        )
        period_note = f" [月度表,期间字段:{t.period_col}]" if t.is_period else ""
        table_desc_lines.append(f"  - {t.table_name} ({t.table_label}){period_note}: {cols}")

    table_desc = "\n".join(table_desc_lines)

    prompt = f"""你是一个数据对比配置专家。根据用户的自然语言描述，提取结构化对比参数。

## 可用表及字段
{table_desc}

## 输出要求
你必须输出一个 JSON 对象，结构如下：

{{
  "compare_type": "roster" | "field" | "amount",
  "source_a": {{
    "table": "表名（必须在上面的可用表中）",
    "period": "YYYYMM 或 null",
    "period_range": null | {{"type": "range", "start": "YYYYMM", "end": "YYYYMM|current_month"}},
    "prefilter": [{{"column": "字段名", "op": "eq|ne|in|not_in|gt|gte|lt|lte|contains|between|is_null|is_not_null", "value": ...}}]
  }},
  "source_b": {{
    "table": "表名（必须在上面的可用表中）",
    "period": "YYYYMM 或 null",
    "period_range": null | {{"type": "range", "start": "YYYYMM", "end": "YYYYMM|current_month"}},
    "prefilter": [{{"column": "字段名", "op": "eq|ne|in|not_in|gt|gte|lt|lte|contains|between|is_null|is_not_null", "value": ...}}]
  }},
  "period_execution": null | {{"mode": "per_period", "alignment": "same_period"}},
  "join_keys": ["关联键字段名"],
  "output": {{ "only_diff": true, "max_detail": 200 }},
  "display": {{
    "template": "auto|roster|field|amount",
    "title": "结果面板标题或 null",
    "subtitle": "结果面板说明或 null",
    "columns": ["用户希望优先展示的明细列"],
    "highlight_columns": ["用户要求重点关注/高亮的列"],
    "hidden_columns": ["用户要求隐藏的列"],
    "primary_metric": "diff_count|only_in_a_count|only_in_b_count|amount_diff|null",
    "show_context": true,
    "show_explanation": true,
    "sort_by": "排序字段或 null",
    "sort_order": "asc|desc"
  }},
  "roster": null | {{ "direction": "both|only_in_a|only_in_b", "display_fields": ["..." ] }},
  "field": null | {{ "pairs": [{{"field_a": "...", "field_b": "...", "mode": "exact|trim|numeric", "tolerance": null}}] }},
  "amount": null | {{ "metric_a": {{"agg": "sum|count|avg", "field": "..."}}, "metric_b": {{...}}, "group_by": ["..."], "tolerance": {{"type": "absolute|percent", "value": 0.0}} }}
}}

## 规则
- compare_type: "roster"=名单差异, "field"=字段值不一致, "amount"=金额不一致
- 只输出 JSON，不要 markdown 代码块，不要解释
- 所有表名必须来自上面的可用表列表
- 所有字段名必须来自对应表的字段列表
- 单月月度表：输出 period，period_range 必须为 null
- 连续区间或“至今”：两个来源都输出 period_range，period 必须为 null；“至今”的 end 使用 current_month，并输出 period_execution
- 非月度表：period 与 period_range 都必须为 null
- 多月范围仅用于两个来源都是月度表，按同月逐月对比
- 字段对比（field）必须输出 field.pairs
- 金额对比（amount）必须输出 amount.group_by + amount.metric_a/b
- display 用于结果展示，不影响 SQL；如果用户提到“只展示/重点看/按...排序/隐藏...”等展示要求，写入 display
- 不知道的值填 null

用户需求：
{user_message}
"""
    response_text = await model_call(prompt)

    # 清理可能的 markdown 包裹
    response_text = response_text.strip()
    if response_text.startswith("```"):
        lines = response_text.split("\n")
        lines = [l for l in lines if not l.startswith("```")]
        response_text = "\n".join(lines).strip()

    try:
        data = json.loads(response_text)
    except json.JSONDecodeError as e:
        raise ValueError(f"LLM 输出不是合法 JSON: {e}\n原始输出: {response_text[:500]}")

    try:
        normalized = await normalize_compare_spec_data(data, loader, instruction=user_message)
        spec = CompareSpec.model_validate(normalized)
    except PydanticValidationError as e:
        raise ValueError(f"CompareSpec structure validation failed: {e}")

    return spec



async def _run_multi_period_compare(
    spec: CompareSpec,
    user,
    db,
    *,
    instruction: str | None = None,
    max_periods: int | None = None,
) -> dict:
    """Resolve a range at execution time and reuse the existing single-month path."""
    from app.data_compare.executor import source_has_data
    from app.data_compare.periods import resolve_period_range

    period_range = spec.source_a.period_range
    if period_range is None:
        raise ValueError("多月对比缺少 source_a.period_range")
    resolution = resolve_period_range(period_range, **({"max_periods": max_periods} if max_periods is not None else {}))
    loader = MetadataLoader(db)
    meta_a = await loader.get_table(spec.source_a.table)
    meta_b = await loader.get_table(spec.source_b.table)
    if meta_a is None or meta_b is None:
        raise ValueError("对比表不存在")

    alias_a, alias_b = ("v", "v") if spec.compare_type == CompareType.AMOUNT else ("t_a", "t_b")
    scope_a, scope_b = await build_scope_for_compare(
        user, spec.source_a.table, spec.source_b.table, loader, db,
        alias_a=alias_a, alias_b=alias_b,
    )

    period_results: list[dict] = []
    details: list[dict] = []
    total_summary = {"total_compared": 0, "matched_count": 0, "diff_count": 0,
                     "only_in_a_count": 0, "only_in_b_count": 0,
                     "total_amount_a": None, "total_amount_b": None, "amount_diff": None}
    amount_totals_available = True
    detail_truncated = False
    started = time.time()

    for period in resolution.resolved_periods:
        month_started = time.time()
        try:
            has_a = await source_has_data(
                table_name=spec.source_a.table, period=period, prefilters=spec.source_a.prefilter,
                loader=loader, scope_clause=scope_a, table_alias=alias_a, db=db,
            )
            has_b = await source_has_data(
                table_name=spec.source_b.table, period=period, prefilters=spec.source_b.prefilter,
                loader=loader, scope_clause=scope_b, table_alias=alias_b, db=db,
            )
            if not has_a or not has_b:
                missing_sources = ([] if has_a else ["source_a"]) + ([] if has_b else ["source_b"])
                period_results.append({
                    "period": period, "status": "data_incomplete", "diff_count": 0,
                    "missing_sources": missing_sources,
                    "duration_ms": int((time.time() - month_started) * 1000),
                })
                continue

            child = spec.model_dump(mode="json")
            for source_key in ("source_a", "source_b"):
                child[source_key]["period"] = period
                child[source_key]["period_range"] = None
            child["period_execution"] = None
            month_result = await run_data_compare(child, user, db, instruction=instruction)
            month_status = "success" if month_result["status"] == "consistent" else "partial_diff"
            summary = month_result["summary"]
            if spec.compare_type == CompareType.AMOUNT:
                month_amounts = (summary.get("total_amount_a"), summary.get("total_amount_b"), summary.get("amount_diff"))
                if any(value is None for value in month_amounts):
                    amount_totals_available = False
                elif amount_totals_available:
                    for key in ("total_amount_a", "total_amount_b", "amount_diff"):
                        total_summary[key] = (total_summary[key] or 0.0) + summary[key]
            for key in ("total_compared", "matched_count", "diff_count", "only_in_a_count", "only_in_b_count"):
                value = summary.get(key)
                if value is not None:
                    total_summary[key] += value
            for row in month_result.get("details", []):
                if len(details) < spec.output.max_detail:
                    details.append({"period": period, **row})
                else:
                    detail_truncated = True
            period_results.append({
                "period": period, "status": month_status,
                "diff_count": summary.get("diff_count", 0),
                "duration_ms": month_result.get("duration_ms"), "summary": summary,
            })
        except Exception as exc:
            period_results.append({
                "period": period, "status": "failed", "diff_count": 0,
                "error_message": str(exc)[:500],
                "duration_ms": int((time.time() - month_started) * 1000),
            })

    statuses = {item["status"] for item in period_results}
    completed = [item for item in period_results if item["status"] in {"success", "partial_diff"}]
    if not completed:
        status = "data_incomplete" if "data_incomplete" in statuses and "failed" not in statuses else "failed"
    elif statuses.intersection({"data_incomplete", "failed"}):
        status = "partial_success"
    elif "partial_diff" in statuses:
        status = "partial_diff"
    else:
        status = "success"

    counts = {
        "success_period_count": sum(item["status"] == "success" for item in period_results),
        "diff_period_count": sum(item["status"] == "partial_diff" for item in period_results),
        "data_incomplete_period_count": sum(item["status"] == "data_incomplete" for item in period_results),
        "failed_period_count": sum(item["status"] == "failed" for item in period_results),
    }
    if spec.compare_type == CompareType.AMOUNT and (
        not amount_totals_available or statuses.intersection({"data_incomplete", "failed"})
    ):
        total_summary["total_amount_a"] = None
        total_summary["total_amount_b"] = None
        total_summary["amount_diff"] = None
    total_summary.update(counts)
    conclusion = (
        f"已完成 {len(completed)}/{len(period_results)} 个月份的逐月对比；"
        f"差异月份 {counts['diff_period_count']}，数据未完成月份 {counts['data_incomplete_period_count']}。"
    )
    return {
        "compare_type": spec.compare_type.value,
        "table_a": meta_a.table_label,
        "table_b": meta_b.table_label,
        "period_a": None, "period_b": None, "status": status,
        "summary": total_summary, "details": details, "conclusion": conclusion,
        "duration_ms": int((time.time() - started) * 1000), "display": spec.display.model_dump(mode="json"),
        "period_resolution": resolution.model_dump(mode="json"), "period_results": period_results,
        "detail_truncated": detail_truncated,
    }


async def run_data_compare(
    spec: CompareSpec | dict,
    user,
    db,
    model_call: callable | None = None,
    instruction: str | None = None,
    return_execution_metadata: bool = False,
    max_periods: int | None = None,
) -> dict | tuple[dict, dict[str, bool]]:
    """完整的对比执行流程：Scope → 校验 → 编译 → 执行 → 格式化。

    如果 spec 已经是 CompareSpec 对象（来自 LLM extractor），直接执行。
    如果 spec 是 dict（来自管理页面直接执行），先 validate。

    Scope injection happens BEFORE template compilation so the engine
    can embed scope conditions directly into WHERE 1=1 — no fragile
    post-compilation string replacement.
    """
    start = time.time()

    # 1. 加载表结构元数据
    loader = MetadataLoader(db)

    # 2. Deterministic normalization + schema validation. This protects both
    # LLM-generated specs and stored/manual specs from common natural-language
    # parsing drift, e.g. period in join_keys or YYYY.MM periods.
    spec = await normalize_compare_spec(spec, loader, instruction=instruction)
    await validate_compare_spec(spec, loader)

    if spec.source_a.period_range or spec.source_b.period_range:
        return await _run_multi_period_compare(
            spec, user, db, instruction=instruction, max_periods=max_periods,
        )

    # 3. 构建行级权限 scope（P0 fix: scope built BEFORE compilation）
    # Alias matches the engine's subquery aliases: t_a/t_b for roster/field, v for amount
    if spec.compare_type.value == "amount":
        alias_a, alias_b = "v", "v"
    else:
        alias_a, alias_b = "t_a", "t_b"
    scope_a, scope_b = await build_scope_for_compare(
        user, spec.source_a.table, spec.source_b.table, loader, db,
        alias_a=alias_a, alias_b=alias_b,
    )

    # 4. 模板编译 → 参数化 SQL（scope 在引擎编译层面注入）
    compiled = await compile_query(spec, loader, scope_a, scope_b)

    # 5. 执行查询
    rows = await execute_compare(compiled, loader, user, db)

    # 6. 格式化结果
    meta_a = await loader.get_table(spec.source_a.table)
    meta_b = await loader.get_table(spec.source_b.table)

    # Build output-column-level sensitive set.
    # The engine renames columns in the output (e.g. field_a → salary_a),
    # so we must map original sensitive columns to their output aliases.
    sensitive_columns: set[str] = set()

    if spec.compare_type == CompareType.FIELD and spec.field:
        for pair in spec.field.pairs:
            if meta_a and pair.field_a in meta_a.columns:
                if meta_a.columns[pair.field_a].is_sensitive:
                    sensitive_columns.add(f"{pair.field_a}_a")
            if meta_b and pair.field_b in meta_b.columns:
                if meta_b.columns[pair.field_b].is_sensitive:
                    sensitive_columns.add(f"{pair.field_b}_b")

    if spec.compare_type == CompareType.AMOUNT and spec.amount:
        if meta_a and spec.amount.metric_a.field in meta_a.columns:
            if meta_a.columns[spec.amount.metric_a.field].is_sensitive:
                sensitive_columns.add("amount_a")
        if meta_b and spec.amount.metric_b.field in meta_b.columns:
            if meta_b.columns[spec.amount.metric_b.field].is_sensitive:
                sensitive_columns.add("amount_b")
        # group_by columns also appear as output columns
        for g in spec.amount.group_by:
            if meta_a and g in meta_a.columns and meta_a.columns[g].is_sensitive:
                sensitive_columns.add(g)
            elif meta_b and g in meta_b.columns and meta_b.columns[g].is_sensitive:
                sensitive_columns.add(g)

    if spec.compare_type == CompareType.ROSTER:
        # Roster output columns are named after each join_key (see engine.py:
        #   SELECT COALESCE(t_a."..." as "jk", ...).
        # For composite keys, EVERY sensitive join key must be added by its
        # output column name (i.e. jk itself), NOT hardcoded "employee_no".
        for jk in spec.join_keys:
            is_sensitive = False
            if meta_a and jk in meta_a.columns:
                is_sensitive = meta_a.columns[jk].is_sensitive
            if not is_sensitive and meta_b and jk in meta_b.columns:
                is_sensitive = meta_b.columns[jk].is_sensitive
            if is_sensitive:
                sensitive_columns.add(jk)  # output column name = join key code

    result = format_result(
        rows=rows,
        compare_type=spec.compare_type,
        table_a_label=meta_a.table_label if meta_a else spec.source_a.table,
        table_b_label=meta_b.table_label if meta_b else spec.source_b.table,
        period_a=spec.source_a.period,
        period_b=spec.source_b.period,
        max_detail=spec.output.max_detail if spec.output else 200,
        duration_ms=int((time.time() - start) * 1000),
        sensitive_columns=sensitive_columns or None,
        display=spec.display,
    )

    result_dict = result.model_dump()
    if return_execution_metadata:
        return result_dict, {"permission_filtered": scope_a.strip() != "true" or scope_b.strip() != "true"}
    return result_dict
