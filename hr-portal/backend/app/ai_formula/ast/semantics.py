# -*- coding: utf-8 -*-
"""语义分析：字段解析、函数白名单与签名校验（AST 阶段 6-7：AST0006 / AST0007）。

职责：
- 将 FIELD("col") / alias.col / col 解析为权威 (alias, column)。
- 校验函数是否在白名单，参数个数/配对是否符合签名。
- 标注 has_aggregate，收集依赖字段与函数列表。
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from .errors import FormulaCompileError, FormulaCompileWarning
from .nodes import (
    BinaryOpNode,
    ComparisonNode,
    FieldRefNode,
    FunctionCallNode,
    LiteralNode,
    Node,
    UnaryOpNode,
)


@dataclass
class FieldInfo:
    alias: str
    column: str
    data_type: str | None = None
    label: str | None = None  # 形如 alias.列标签

    @property
    def code(self) -> str:
        return f"{self.alias}.{self.column}"

    @property
    def label_tail(self) -> str:
        if self.label and "." in self.label:
            return self.label.split(".", 1)[-1]
        return self.label or self.column


@dataclass
class FunctionSpec:
    name: str
    min_args: int
    max_args: int  # -1 表示可变
    is_aggregate: bool
    category: str  # aggregate | scalar | logical
    arity_rule: str | None = None  # "even" | "odd" | None
    description: str = ""


def _register() -> dict[str, FunctionSpec]:
    specs: dict[str, FunctionSpec] = {}
    agg = "aggregate"
    scl = "scalar"
    log = "logical"

    def add(name, mn, mx, is_agg, cat, rule=None, desc=""):
        specs[name.upper()] = FunctionSpec(name.upper(), mn, mx, is_agg, cat, rule, desc)

    # 聚合函数
    add("COUNT", 0, 1, True, agg, desc="计数；无参数时为 COUNT(*)")
    add("COUNTA", 1, 1, True, agg, desc="计数非空")
    add("SUM", 1, 1, True, agg, desc="求和")
    add("AVERAGE", 1, 1, True, agg, desc="平均值（SQL AVG）")
    add("AVG", 1, 1, True, agg, desc="平均值（SQL AVG）")
    add("MAX", 1, 1, True, agg, desc="最大值")
    add("MIN", 1, 1, True, agg, desc="最小值")
    add("COUNTIF", 2, 2, True, agg, desc="条件计数")
    add("COUNTIFS", 2, -1, True, agg, "even", desc="多条件计数（range, criteria 成对）")
    add("SUMIF", 2, 3, True, agg, desc="条件求和（range, criteria[, sum_range]）")
    add("SUMIFS", 3, -1, True, agg, "odd", desc="多条件求和（sum_range, range, criteria 成对）")
    add("AVERAGEIF", 2, 3, True, agg, desc="条件平均（range, criteria[, avg_range]）")
    add("AVERAGEIFS", 3, -1, True, agg, "odd", desc="多条件平均（avg_range, range, criteria 成对）")
    # 标量函数
    add("ROUND", 1, 2, False, scl, desc="四舍五入")
    add("ABS", 1, 1, False, scl, desc="绝对值")
    add("IF", 2, 3, False, scl, desc="条件分支")
    add("IFERROR", 2, 2, False, scl, desc="错误回退（SQL COALESCE）")
    add("AND", 2, -1, False, log, desc="逻辑与")
    add("OR", 2, -1, False, log, desc="逻辑或")
    add("NOT", 1, 1, False, log, desc="逻辑非")
    add("ISBLANK", 1, 1, False, scl, desc="是否为空")
    add("YEAR", 1, 1, False, scl, desc="取年份")
    add("MONTH", 1, 1, False, scl, desc="取月份")
    add("SAFE_DIVIDE", 2, 3, False, scl, desc="安全除法（分母为0返回默认值）")
    return specs


BUILTIN_FUNCTIONS: dict[str, FunctionSpec] = _register()

# 聚合函数名集合（用于 has_aggregate 检测）
AGGREGATE_FUNCTIONS = {
    name for name, spec in BUILTIN_FUNCTIONS.items() if spec.is_aggregate
}

# 需要 COUNT(*) FILTER 的条件聚合函数
CONDITIONAL_AGGREGATES = {
    "COUNTIF", "COUNTIFS", "SUMIF", "SUMIFS", "AVERAGEIF", "AVERAGEIFS",
}


class FieldResolver:
    """字段引用解析器。

    fields 接受 FieldInfo 列表，或含 alias/column/data_type/label 键的字典列表。
    """

    def __init__(self, fields: list[Any]):
        self.all: list[FieldInfo] = []
        for f in fields:
            if isinstance(f, FieldInfo):
                self.all.append(f)
            else:
                self.all.append(
                    FieldInfo(
                        alias=f["alias"],
                        column=f["column"],
                        data_type=f.get("data_type"),
                        label=f.get("label"),
                    )
                )
        # 限定名精确索引：alias.column
        self.by_alias_col: dict[tuple[str, str], FieldInfo] = {}
        for fi in self.all:
            self.by_alias_col.setdefault((fi.alias, fi.column), fi)
            if fi.label:
                tail = fi.label_tail
                self.by_alias_col.setdefault((fi.alias, tail), fi)

    def resolve(self, raw: str) -> FieldInfo:
        raw = (raw or "").strip()
        if not raw:
            raise FormulaCompileError(
                code="unknown_field",
                message="字段引用为空",
                field=raw,
                suggestion="请使用 alias.列名 或 列名 的形式引用字段",
            )
        if "." in raw:
            alias, _, col = raw.partition(".")
            # 精确：alias.column_code
            key = (alias, col)
            if key in self.by_alias_col:
                return self.by_alias_col[key]
            # 候选：alias + (column_code 或 label_tail)
            cands = [
                fi for fi in self.all
                if fi.alias == alias and (fi.column == col or fi.label_tail == col)
            ]
            if len(cands) == 1:
                return cands[0]
            if len(cands) > 1:
                raise FormulaCompileError(
                    code="ambiguous_field",
                    message=f"字段引用存在歧义：{raw}（命中多个表）",
                    field=raw,
                    suggestion="请为字段加上表别名前缀，例如 表别名." + col,
                )
            raise FormulaCompileError(
                code="unknown_field",
                message=f"字段不存在或未暴露：{raw}",
                field=raw,
                suggestion="请检查表别名和字段名是否正确",
            )
        # 裸引用：按 column_code / label_tail 匹配
        cands = [
            fi for fi in self.all
            if fi.column == raw or fi.label_tail == raw
        ]
        if not cands:
            raise FormulaCompileError(
                code="unknown_field",
                message=f"字段不存在或未暴露：{raw}",
                field=raw,
                suggestion="请检查字段名是否正确，或使用 alias.列名 形式",
            )
        distinct = {(fi.alias, fi.column) for fi in cands}
        if len(distinct) > 1:
            tables = "、".join(sorted(a for a, _ in distinct))
            raise FormulaCompileError(
                code="ambiguous_field",
                message=f"字段引用存在歧义：{raw}（出现在 {tables} 等多个表）",
                field=raw,
                suggestion=f"请加上表别名前缀以消歧，例如：{tables.split('、')[0]}.{raw}",
            )
        return cands[0]


class SemanticAnalyzer:
    def __init__(self, resolver: FieldResolver):
        self.resolver = resolver
        self.errors: list[FormulaCompileError] = []
        self.warnings: list[FormulaCompileWarning] = []
        self.functions: set[str] = set()
        self.dependencies: dict[tuple[str, str], dict[str, Any]] = {}
        self.has_aggregate = False

    def analyze(self, node: Node) -> None:
        self._visit(node)

    def _visit(self, node: Node) -> None:
        if isinstance(node, LiteralNode):
            return
        if isinstance(node, FieldRefNode):
            self._resolve_field(node)
            return
        if isinstance(node, FunctionCallNode):
            self._handle_function(node)
            return
        if isinstance(node, (BinaryOpNode, ComparisonNode)):
            self._visit(node.left)
            self._visit(node.right)
            return
        if isinstance(node, UnaryOpNode):
            self._visit(node.operand)
            return
        # 未知节点类型，忽略

    def _resolve_field(self, node: FieldRefNode) -> None:
        try:
            info = self.resolver.resolve(node.raw)
        except FormulaCompileError as e:
            self.errors.append(e)
            return
        node.resolved = True
        node.resolved_alias = info.alias
        node.resolved_column = info.column
        node.data_type = info.data_type
        self.dependencies[(info.alias, info.column)] = {
            "field_code": info.column,
            "field_label": info.label_tail if info.label else info.column,
            "source_alias": info.alias,
            "source_column": info.column,
        }
        if info.label is None:
            # 仅有 column_code 时，label 与 column 同值
            self.dependencies[(info.alias, info.column)]["field_label"] = info.column

    def _handle_function(self, node: FunctionCallNode) -> None:
        # FIELD() 视为字段引用
        if node.name.upper() == "FIELD":
            self._rewrite_field_func(node)
            return
        spec = BUILTIN_FUNCTIONS.get(node.name.upper())
        if spec is None:
            self.errors.append(
                FormulaCompileError(
                    code="unsupported_function",
                    message=f"暂不支持函数 {node.name}",
                    function=node.name,
                    start=node.span.start,
                    end=node.span.end,
                    suggestion="请使用白名单内的函数，如 COUNTIF / SUMIF / IF / ROUND 等",
                )
            )
            # 仍递归检查参数，避免遗漏后续错误
            for arg in node.args:
                self._visit(arg)
            return
        # 参数个数校验
        n = len(node.args)
        if spec.max_args == -1:
            if n < spec.min_args:
                self.errors.append(self._arity_error(node, spec, n))
                return
            if spec.arity_rule == "even" and n % 2 != 0:
                self.errors.append(
                    FormulaCompileError(
                        code="function_arg_count",
                        message=f"函数 {spec.name} 的参数必须成对（range, criteria）",
                        function=spec.name,
                        start=node.span.start,
                        end=node.span.end,
                        suggestion="每个条件需提供 范围 与 条件 两个参数",
                    )
                )
                return
            if spec.arity_rule == "odd" and n % 2 == 0:
                self.errors.append(
                    FormulaCompileError(
                        code="function_arg_count",
                        message=f"函数 {spec.name} 的参数必须成对（sum_range, range, criteria ...）",
                        function=spec.name,
                        start=node.span.start,
                        end=node.span.end,
                        suggestion="首个参数为求和/平均列，其后每对为 范围 与 条件",
                    )
                )
                return
        else:
            if n < spec.min_args or n > spec.max_args:
                self.errors.append(self._arity_error(node, spec, n))
                return
        if spec.is_aggregate:
            self.has_aggregate = True
        self.functions.add(spec.name)
        for arg in node.args:
            self._visit(arg)

    def _arity_error(self, node: FunctionCallNode, spec: FunctionSpec, n: int) -> FormulaCompileError:
        if spec.max_args == -1:
            expect = f"至少 {spec.min_args} 个"
        elif spec.min_args == spec.max_args:
            expect = f"恰好 {spec.min_args} 个"
        else:
            expect = f"{spec.min_args}~{spec.max_args} 个"
        return FormulaCompileError(
            code="function_arg_count",
            message=f"函数 {spec.name} 参数数量错误：传入 {n} 个，应为 {expect}",
            function=spec.name,
            start=node.span.start,
            end=node.span.end,
            suggestion=f"请检查 {spec.name} 的参数个数",
        )

    def _rewrite_field_func(self, node: FunctionCallNode) -> None:
        if len(node.args) != 1 or not isinstance(node.args[0], LiteralNode):
            self.errors.append(
                FormulaCompileError(
                    code="field_arg_error",
                    message="FIELD() 必须包含一个字符串参数，例如 FIELD(\"employee_type\")",
                    function="FIELD",
                    start=node.span.start,
                    end=node.span.end,
                    suggestion="请将字段编码放入 FIELD(\"...\")",
                )
            )
            return
        raw = str(node.args[0].value)
        field_node = FieldRefNode(
            raw=raw,
            is_field_func=True,
            span=node.span,
        )
        self._resolve_field(field_node)
        # 替换原节点的语义角色：把 FunctionCallNode 就地转为字段引用信息
        node.name = "FIELD"  # 标记已处理
        node.args = [field_node]  # 用 FieldRefNode 承载解析结果
