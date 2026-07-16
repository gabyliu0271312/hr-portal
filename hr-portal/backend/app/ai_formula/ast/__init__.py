# -*- coding: utf-8 -*-
"""Excel 公式 → SQL 的确定性 AST 编译器（AST0001+）。

对外统一入口：
- compile_formula(formula, resolver, options)  # 不依赖数据库
- compile_formula_to_sql(db, formula, dataset_id, ...)  # 经 dataset 字段映射
"""
from __future__ import annotations

from .compiler import (
    COMPILER_ENGINE,
    COMPILER_VERSION,
    FormulaCompileOptions,
    FormulaCompileResult,
    compile_formula,
    compile_formula_to_sql,
    resolver_from_field_meta,
)
from .excel_criteria import compile_criterion
from .errors import (
    FormulaCompileError,
    FormulaCompileWarning,
    SourceSpan,
    flatten_errors,
)
from .lexer import Lexer, LexError
from .nodes import (
    BinaryOpNode,
    ComparisonNode,
    FieldRefNode,
    FunctionCallNode,
    LiteralNode,
    Node,
    UnaryOpNode,
)
from .parser import ParseError, parse
from .safety import safety_issues
from .semantics import (
    BUILTIN_FUNCTIONS,
    AGGREGATE_FUNCTIONS,
    CONDITIONAL_AGGREGATES,
    FieldInfo,
    FieldResolver,
    SemanticAnalyzer,
)
from .sql_generator import SqlGenerator, quote_ident
from .tokens import Token, TokenType

__all__ = [
    "COMPILER_ENGINE",
    "COMPILER_VERSION",
    "FormulaCompileOptions",
    "FormulaCompileResult",
    "compile_formula",
    "compile_formula_to_sql",
    "resolver_from_field_meta",
    "FormulaCompileError",
    "FormulaCompileWarning",
    "SourceSpan",
    "flatten_errors",
    "Lexer",
    "LexError",
    "Node",
    "LiteralNode",
    "FieldRefNode",
    "FunctionCallNode",
    "BinaryOpNode",
    "UnaryOpNode",
    "ComparisonNode",
    "ParseError",
    "parse",
    "safety_issues",
    "BUILTIN_FUNCTIONS",
    "AGGREGATE_FUNCTIONS",
    "CONDITIONAL_AGGREGATES",
    "FieldInfo",
    "FieldResolver",
    "SemanticAnalyzer",
    "SqlGenerator",
    "quote_ident",
    "compile_criterion",
    "Token",
    "TokenType",
]
