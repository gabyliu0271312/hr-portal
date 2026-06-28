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
    "prefilter": [{{"column": "字段名", "op": "eq|ne|in|not_in|gt|gte|lt|lte|contains|between|is_null|is_not_null", "value": ...}}]
  }},
  "source_b": {{ "table": "...", "period": "...", "prefilter": [...] }},
  "join_keys": ["关联键字段名"],
  "output": {{ "only_diff": true, "max_detail": 200 }},
  "roster": null | {{ "direction": "both|only_in_a|only_in_b", "display_fields": ["..." ] }},
  "field": null | {{ "pairs": [{{"field_a": "...", "field_b": "...", "mode": "exact|trim|numeric", "tolerance": null}}] }},
  "amount": null | {{ "metric_a": {{"agg": "sum|count|avg", "field": "..."}}, "metric_b": {{...}}, "group_by": ["..."], "tolerance": {{"type": "absolute|percent", "value": 0.0}} }}
}}

## 规则
- compare_type: "roster"=名单差异, "field"=字段值不一致, "amount"=金额不一致
- 只输出 JSON，不要 markdown 代码块，不要解释
- 所有表名必须来自上面的可用表列表
- 所有字段名必须来自对应表的字段列表
- 月度表必须输出 period
- 字段对比（field）必须输出 field.pairs
- 金额对比（amount）必须输出 amount.group_by + amount.metric_a/b
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



async def run_data_compare(
    spec: CompareSpec | dict,
    user,
    db,
    model_call: callable | None = None,
    instruction: str | None = None,
) -> dict:
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
    )

    return result.model_dump()
