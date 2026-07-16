# -*- coding: utf-8 -*-
"""SQL 生成器（AST 阶段 9-11：AST0009 / AST0010 / AST0011）。

- 字段双引号：`"alias"."column"`
- 字符串单引号转义
- & -> ||（字符串拼接）
- 聚合函数 -> COUNT/SUM/AVG... FILTER (WHERE ...)
- 除法自动 NULLIF(分母, 0)::numeric，且不重复包裹
"""
from __future__ import annotations

from typing import Any

from .errors import FormulaCompileWarning
from .excel_criteria import compile_criterion
from .nodes import (
    BinaryOpNode,
    ComparisonNode,
    FieldRefNode,
    FunctionCallNode,
    LiteralNode,
    Node,
    UnaryOpNode,
)


def quote_ident(name: str) -> str:
    return '"' + name.replace('"', '""') + '"'


def _escape_sql_string(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


_COMPARISON_SQL = {
    "=": "=",
    "<>": "<>",
    ">": ">",
    ">=": ">=",
    "<": "<",
    "<=": "<=",
}


class SqlGenerator:
    def __init__(self):
        self.warnings: list[FormulaCompileWarning] = []

    def gen(self, node: Node) -> str:
        if isinstance(node, LiteralNode):
            return self._gen_literal(node)
        if isinstance(node, FieldRefNode):
            return self._gen_field(node)
        if isinstance(node, FunctionCallNode):
            return self._gen_function(node)
        if isinstance(node, UnaryOpNode):
            inner = self.gen(node.operand)
            if isinstance(node.operand, (BinaryOpNode, ComparisonNode, UnaryOpNode)):
                inner = f"({inner})"
            return f"-{inner}" if node.op == "-" else inner
        if isinstance(node, ComparisonNode):
            l = self.gen(node.left)
            r = self.gen(node.right)
            op = _COMPARISON_SQL.get(node.op, node.op)
            return f"{l} {op} {r}"
        if isinstance(node, BinaryOpNode):
            return self._gen_binary(node)
        raise TypeError(f"无法生成 SQL：未知节点 {type(node).__name__}")

    def _gen_literal(self, node: LiteralNode) -> str:
        if node.literal_type == "number":
            return str(node.value)
        if node.literal_type == "string":
            return _escape_sql_string(str(node.value))
        if node.literal_type == "boolean":
            return "TRUE" if node.value else "FALSE"
        if node.literal_type == "null":
            return "NULL"
        if node.literal_type == "star":
            return "*"
        return str(node.value)

    def _gen_field(self, node: FieldRefNode) -> str:
        if node.resolved and node.resolved_alias and node.resolved_column:
            return f"{quote_ident(node.resolved_alias)}.{quote_ident(node.resolved_column)}"
        # 未解析（理论上不应发生，语义阶段已校验）：原样加引号
        alias = node.alias or "current"
        col = node.column or node.raw
        return f"{quote_ident(alias)}.{quote_ident(col)}"

    def _gen_binary(self, node: BinaryOpNode) -> str:
        if node.op == "/":
            l_sql = self.gen(node.left)
            r_sql = self.gen(node.right)
            if isinstance(node.left, (BinaryOpNode, ComparisonNode, UnaryOpNode)):
                l_sql = f"({l_sql})"
            if r_sql.startswith("NULLIF("):
                denom = r_sql
            else:
                denom = f"NULLIF({r_sql}, 0)::numeric"
            return f"{l_sql} / {denom}"
        op = {
            "+": "+",
            "-": "-",
            "*": "*",
            "&": "||",
        }.get(node.op, node.op)
        l = self.gen(node.left)
        r = self.gen(node.right)
        return f"{l} {op} {r}"

    def _gen_function(self, node: FunctionCallNode) -> str:
        name = node.name.upper()
        # FIELD() 已转为字段引用信息
        if name == "FIELD":
            if node.args and isinstance(node.args[0], FieldRefNode):
                return self._gen_field(node.args[0])
            return self.gen(node.args[0]) if node.args else "NULL"
        handler = getattr(self, f"_fn_{name.lower()}", None)
        if handler is not None:
            return handler(node)
        # 白名单外（理论上语义阶段已拦截）
        return f"{name}({', '.join(self.gen(a) for a in node.args)})"

    # ---- 聚合 ----
    def _fn_count(self, node: FunctionCallNode) -> str:
        if node.args and isinstance(node.args[0], LiteralNode) and node.args[0].value == "*":
            return "COUNT(*)"
        if not node.args:
            return "COUNT(*)"
        return f"COUNT({', '.join(self.gen(a) for a in node.args)})"

    def _fn_counta(self, node: FunctionCallNode) -> str:
        inner = self.gen(node.args[0])
        return f"COUNT(*) FILTER (WHERE {inner} IS NOT NULL AND {inner}::text <> '')"

    def _fn_sum(self, node: FunctionCallNode) -> str:
        return f"SUM({', '.join(self.gen(a) for a in node.args)})"

    def _fn_avg(self, node: FunctionCallNode) -> str:
        return f"AVG({', '.join(self.gen(a) for a in node.args)})"

    def _fn_average(self, node: FunctionCallNode) -> str:
        return f"AVG({', '.join(self.gen(a) for a in node.args)})"

    def _fn_max(self, node: FunctionCallNode) -> str:
        return f"MAX({', '.join(self.gen(a) for a in node.args)})"

    def _fn_min(self, node: FunctionCallNode) -> str:
        return f"MIN({', '.join(self.gen(a) for a in node.args)})"

    # ---- 条件聚合 ----
    def _countif_condition(self, range_node: Node, crit_node: Node) -> str:
        col_sql = self.gen(range_node)
        raw = self._criterion_raw(crit_node)
        if raw is None:
            # 非字符串条件：作为 SQL 表达式直接使用
            return self.gen(crit_node)
        cond, warns = compile_criterion(col_sql, raw, data_type=getattr(range_node, "data_type", None))
        self.warnings.extend(warns)
        return cond

    @staticmethod
    def _criterion_raw(crit_node: Node) -> str | None:
        if isinstance(crit_node, LiteralNode) and crit_node.literal_type == "string":
            return str(crit_node.value)
        return None

    def _fn_countif(self, node: FunctionCallNode) -> str:
        cond = self._countif_condition(node.args[0], node.args[1])
        return f"COUNT(*) FILTER (WHERE {cond})"

    def _fn_countifs(self, node: FunctionCallNode) -> str:
        conds: list[str] = []
        i = 0
        while i + 1 < len(node.args):
            conds.append(self._countif_condition(node.args[i], node.args[i + 1]))
            i += 2
        return "COUNT(*) FILTER (WHERE " + " AND ".join(conds) + ")"

    def _fn_sumif(self, node: FunctionCallNode) -> str:
        if len(node.args) >= 3:
            sum_sql = self.gen(node.args[2])
            col_sql = self.gen(node.args[0])
            raw = self._criterion_raw(node.args[1])
            if raw is None:
                cond = self.gen(node.args[1])
            else:
                cond, warns = compile_criterion(col_sql, raw, data_type=getattr(node.args[0], "data_type", None))
                self.warnings.extend(warns)
            return f"SUM({sum_sql}) FILTER (WHERE {cond})"
        col_sql = self.gen(node.args[0])
        raw = self._criterion_raw(node.args[1])
        if raw is None:
            cond = self.gen(node.args[1])
        else:
            cond, warns = compile_criterion(col_sql, raw, data_type=getattr(node.args[0], "data_type", None))
            self.warnings.extend(warns)
        return f"SUM({col_sql}) FILTER (WHERE {cond})"

    def _fn_sumifs(self, node: FunctionCallNode) -> str:
        sum_sql = self.gen(node.args[0])
        conds: list[str] = []
        i = 1
        while i + 1 < len(node.args):
            conds.append(self._countif_condition(node.args[i], node.args[i + 1]))
            i += 2
        return "SUM(" + sum_sql + ") FILTER (WHERE " + " AND ".join(conds) + ")"

    def _fn_averageif(self, node: FunctionCallNode) -> str:
        if len(node.args) >= 3:
            avg_sql = self.gen(node.args[2])
            col_sql = self.gen(node.args[0])
        else:
            avg_sql = self.gen(node.args[0])
            col_sql = self.gen(node.args[0])
        raw = self._criterion_raw(node.args[1])
        if raw is None:
            cond = self.gen(node.args[1])
        else:
            cond, warns = compile_criterion(col_sql, raw, data_type=getattr(node.args[0], "data_type", None))
            self.warnings.extend(warns)
        return f"AVG({avg_sql}) FILTER (WHERE {cond})"

    def _fn_averageifs(self, node: FunctionCallNode) -> str:
        avg_sql = self.gen(node.args[0])
        conds: list[str] = []
        i = 1
        while i + 1 < len(node.args):
            conds.append(self._countif_condition(node.args[i], node.args[i + 1]))
            i += 2
        return "AVG(" + avg_sql + ") FILTER (WHERE " + " AND ".join(conds) + ")"

    # ---- 标量 ----
    def _fn_round(self, node: FunctionCallNode) -> str:
        args = [self.gen(a) for a in node.args]
        return f"ROUND({', '.join(args)})"

    def _fn_abs(self, node: FunctionCallNode) -> str:
        return f"ABS({self.gen(node.args[0])})"

    def _fn_if(self, node: FunctionCallNode) -> str:
        cond = self.gen(node.args[0])
        then = self.gen(node.args[1])
        if len(node.args) >= 3:
            els = self.gen(node.args[2])
            return f"CASE WHEN {cond} THEN {then} ELSE {els} END"
        return f"CASE WHEN {cond} THEN {then} END"

    def _fn_iferror(self, node: FunctionCallNode) -> str:
        # 仅当表达式为安全表达式时使用 COALESCE 兜底
        return f"COALESCE({self.gen(node.args[0])}, {self.gen(node.args[1])})"

    def _fn_and(self, node: FunctionCallNode) -> str:
        return "(" + " AND ".join(self.gen(a) for a in node.args) + ")"

    def _fn_or(self, node: FunctionCallNode) -> str:
        return "(" + " OR ".join(self.gen(a) for a in node.args) + ")"

    def _fn_not(self, node: FunctionCallNode) -> str:
        return f"(NOT {self.gen(node.args[0])})"

    def _fn_isblank(self, node: FunctionCallNode) -> str:
        x = self.gen(node.args[0])
        return f"({x} IS NULL OR {x}::text = '')"

    def _fn_year(self, node: FunctionCallNode) -> str:
        return f"EXTRACT(YEAR FROM {self.gen(node.args[0])})"

    def _fn_month(self, node: FunctionCallNode) -> str:
        return f"EXTRACT(MONTH FROM {self.gen(node.args[0])})"
