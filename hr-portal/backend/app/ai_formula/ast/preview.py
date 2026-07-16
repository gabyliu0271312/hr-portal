# -*- coding: utf-8 -*-
"""公式样本预览执行器（AST0014 中 preview=true 的真正实现）。

需求文档要求（preview_result）：
    {
      "value": 0.82,
      "row_count": 1
    }

职责（严格对齐需求）：
- 只执行当前数据集「可访问」的源表（read-only SELECT，不碰其他表）。
- 将公式生成的 SQL（一个表达式）包装为安全的 SELECT。
- 限制行数（LIMIT），避免大表全扫。
- 捕获 SQL 执行错误，绝不向上抛异常（预览失败不影响编译主流程）。
- 返回结构化 {"value": ..., "row_count": N, "warnings": [...]}。

说明：
- 指标公式为聚合表达式，
  `SELECT (<expr>) AS value FROM "<table>" LIMIT 1` 返回单行标量 → row_count=1。
- 非聚合（表达式模式）可返回多行：value 取首行，row_count 为实际行数。
- 不执行任何 DDL/DML，不创建持久视图；FROM 表名用双引号转义防注入。
"""
from __future__ import annotations

from collections import Counter
from typing import Any

from sqlalchemy import select, text as sa_text
from sqlalchemy.ext.asyncio import AsyncSession

from app.datasets.models import DataSetTable
from app.ai_formula.ast.errors import FormulaCompileWarning


def _quote_ident(ident: str) -> str:
    """安全转义标识符（双写引号），防止标识符注入。"""
    return '"' + ident.replace('"', '""') + '"'


async def _resolve_from_table(
    db: AsyncSession, dataset_id: int, fields: list | None
) -> tuple[str, str] | None:
    """返回该数据集应作为 FROM 的源表名。

    策略：取被公式引用列最多的那张表（fields 携带 alias，
    alias 映射到 DataSetTable.table_name）。多表数据集通常有一张主表，
    这也符合「只执行当前数据集可访问视图」的语义。
    """
    rows = (
        await db.execute(
            select(DataSetTable.alias, DataSetTable.table_name).where(
                DataSetTable.dataset_id == dataset_id
            )
        )
    ).all()
    if not rows:
        return None
    alias_to_table = {alias: table for alias, table in rows}
    if fields:
        cnt = Counter(getattr(f, "alias", None) or "current" for f in fields)
        for alias, _ in cnt.most_common():
            if alias in alias_to_table:
                return (alias_to_table[alias], alias)
    # 兜底：第一张表
    first_alias, first_table = rows[0]
    return (first_table, first_alias)


async def run_preview(
    db: AsyncSession,
    sql: str,
    dataset_id: int,
    *,
    fields: list | None = None,
    limit: int = 1,
) -> dict[str, Any]:
    """对公式生成的 SQL 执行安全预览，返回结构化结果。

    任何失败（无源表 / 执行异常 / 解析异常）一律返回
    {"value": None, "row_count": 0, "warnings": [...]}，
    绝不向外抛异常。
    """
    limit = max(1, min(int(limit), 1000))

    resolved = await _resolve_from_table(db, dataset_id, fields)
    if not resolved:
        return {
            "value": None,
            "row_count": 0,
            "warnings": [
                FormulaCompileWarning(
                    code="preview_no_table",
                    message="数据集没有可查询的源表，无法预览",
                ).to_dict()
            ],
        }
    table, alias = resolved

    # 把公式表达式安全地包成 SELECT，并限制行数。
    # 必须加 AS alias，因为 AST 生成的列引用是 "alias"."column" 形式。
    wrapped = (
        f"SELECT ({sql}) AS value "
        f"FROM {_quote_ident(table)} AS {_quote_ident(alias)} "
        f"LIMIT :limit"
    )
    try:
        result = await db.execute(sa_text(wrapped), {"limit": limit})
        rows = result.mappings().all()
    except Exception as exc:  # 任何执行错误都吞掉，转为警告
        return {
            "value": None,
            "row_count": 0,
            "warnings": [
                FormulaCompileWarning(
                    code="preview_exec_error",
                    message=f"预览执行失败：{exc}",
                ).to_dict()
            ],
        }

    row_count = len(rows)
    value = rows[0]["value"] if row_count else None
    return {
        "value": value,
        "row_count": row_count,
        "warnings": [],
    }
