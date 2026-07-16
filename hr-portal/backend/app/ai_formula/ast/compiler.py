# -*- coding: utf-8 -*-
"""统一编译入口（AST 阶段 12：AST0012）。

对外：
- compile_formula(formula, resolver, options) —— 不依赖数据库（字段映射由 resolver 注入）。
- compile_formula_to_sql(db, formula, dataset_id, ...) —— 经 dataset_field_meta 构建 resolver。

流程：normalize → lexer → parser → semantics → sql_generator → safety。
失败返回结构化 errors，绝不向 API 抛裸异常。
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from .errors import FormulaCompileError, FormulaCompileWarning
from .lexer import Lexer
from .nodes import Node
from .parser import ParseError, parse
from .safety import safety_issues
from .semantics import FieldInfo, FieldResolver, SemanticAnalyzer
from .sql_generator import SqlGenerator

COMPILER_ENGINE = "ast"
COMPILER_VERSION = "1.0.0"


@dataclass
class FormulaCompileOptions:
    mode: str = "metric"          # metric | expression | component
    include_ast: bool = False
    preview: bool = False
    engine: str = COMPILER_ENGINE
    version: str = COMPILER_VERSION


@dataclass
class FormulaCompileResult:
    valid: bool
    sql: str
    normalized_formula: str
    has_aggregate: bool
    dependencies: list[dict[str, Any]]
    functions: list[str]
    warnings: list[FormulaCompileWarning]
    errors: list[FormulaCompileError]
    ast: dict[str, Any] | None
    compiler: dict[str, str]
    preview_result: dict[str, Any] | None = None
    meta: dict[str, Any] | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "valid": self.valid,
            "sql": self.sql,
            "normalized_formula": self.normalized_formula,
            "has_aggregate": self.has_aggregate,
            "dependencies": [d for d in self.dependencies],
            "functions": self.functions,
            "warnings": [w.to_dict() for w in self.warnings],
            "errors": [e.to_dict() for e in self.errors],
            "ast": self.ast,
            "compiler": self.compiler,
            "preview_result": self.preview_result,
            "meta": self.meta,
        }


def _result(
    *,
    valid: bool,
    sql: str,
    normalized: str,
    has_aggregate: bool,
    dependencies: list[dict[str, Any]],
    functions: list[str],
    warnings: list[FormulaCompileWarning],
    errors: list[FormulaCompileError],
    ast: dict[str, Any] | None,
    options: FormulaCompileOptions,
) -> FormulaCompileResult:
    return FormulaCompileResult(
        valid=valid,
        sql=sql,
        normalized_formula=normalized,
        has_aggregate=has_aggregate,
        dependencies=dependencies,
        functions=functions,
        warnings=warnings,
        errors=errors,
        ast=ast,
        compiler={"engine": options.engine, "version": options.version},
    )


def compile_formula(
    formula: str,
    resolver: FieldResolver,
    *,
    options: FormulaCompileOptions | None = None,
) -> FormulaCompileResult:
    options = options or FormulaCompileOptions()
    from app.ai_formula.formula_parser import normalize_formula

    normalized = normalize_formula(formula)
    if not normalized or normalized in ("=", "= "):
        return _result(
            valid=False, sql="", normalized=normalized,
            has_aggregate=False, dependencies=[], functions=[],
            warnings=[], errors=[FormulaCompileError(
                code="empty_formula", message="公式不能为空",
                suggestion="请输入有效的 Excel 风格公式",
            )], ast=None, options=options,
        )

    # 去掉前缀 = 用于词法分析（输出保留 =）
    expr_text = normalized[1:] if normalized.startswith("=") else normalized
    expr_text = expr_text.strip()

    errors: list[FormulaCompileError] = []
    warnings: list[FormulaCompileWarning] = []

    # 1. 词法
    try:
        tokens = Lexer(expr_text).tokenize()
    except Exception as e:  # LexError
        msg = str(e)
        return _result(
            valid=False, sql="", normalized=normalized,
            has_aggregate=False, dependencies=[], functions=[],
            warnings=[], errors=[FormulaCompileError(
                code="lex_error", message=f"词法解析失败：{msg}",
            )], ast=None, options=options,
        )

    # 2. 语法
    try:
        ast: Node = parse(expr_text)
    except ParseError as pe:
        return _result(
            valid=False, sql="", normalized=normalized,
            has_aggregate=False, dependencies=[], functions=[],
            warnings=[], errors=[pe.error], ast=None, options=options,
        )

    # 3. 语义
    analyzer = SemanticAnalyzer(resolver)
    analyzer.analyze(ast)
    errors.extend(analyzer.errors)
    warnings.extend(analyzer.warnings)

    sql = ""
    if not errors:
        # 4. SQL 生成
        gen = SqlGenerator()
        sql = gen.gen(ast)
        warnings.extend(gen.warnings)
        # 5. 安全校验
        errors.extend(safety_issues(sql))

    ast_dict = ast.to_dict() if options.include_ast else None

    return _result(
        valid=len(errors) == 0,
        sql=sql,
        normalized=normalized,
        has_aggregate=analyzer.has_aggregate,
        dependencies=list(analyzer.dependencies.values()),
        functions=sorted(analyzer.functions),
        warnings=warnings,
        errors=errors,
        ast=ast_dict,
        options=options,
    )


def resolver_from_field_meta(fields: list[Any]) -> FieldResolver:
    infos: list[FieldInfo] = []
    for f in fields:
        if isinstance(f, FieldInfo):
            infos.append(f)
        else:
            infos.append(FieldInfo(
                alias=getattr(f, "alias", None) or "current",
                column=getattr(f, "column_code", None) or getattr(f, "column", ""),
                data_type=getattr(f, "data_type", None),
                label=getattr(f, "label", None),
            ))
    return FieldResolver(infos)


async def compile_formula_to_sql(
    db: AsyncSession,
    formula: str,
    dataset_id: int,
    *,
    mode: str = "metric",
    options: FormulaCompileOptions | None = None,
) -> FormulaCompileResult:
    from app.ai_formula.field_refs import dataset_field_meta

    options = options or FormulaCompileOptions(mode=mode)
    if options.engine == "legacy":
        # 由调用方（translate_formula_to_sql）负责 legacy 分支
        raise ValueError("legacy engine 应在 translate_formula_to_sql 中调度")
    try:
        _, fields = await dataset_field_meta(dataset_id, db)
    except Exception as e:
        return _result(
            valid=False, sql="", normalized=normalize(formula),
            has_aggregate=False, dependencies=[], functions=[],
            warnings=[], errors=[FormulaCompileError(
                code="dataset_unavailable",
                message=f"无法读取数据集字段：{e}",
            )], ast=None, options=options,
        )
    resolver = resolver_from_field_meta(fields)
    result = compile_formula(formula, resolver, options=options)

    # AST0014 preview=true：仅在编译有效且显式要求时执行样本预览（best-effort）。
    # 预览失败绝不阻断编译主流程。
    if options.preview and result.valid and result.sql:
        from .preview import run_preview

        try:
            result.preview_result = await run_preview(
                db, result.sql, dataset_id, fields=fields, limit=1
            )
        except Exception:
            result.preview_result = {
                "value": None,
                "row_count": 0,
                "warnings": [
                    {"code": "preview_failed", "message": "预览执行异常"}
                ],
            }

    return result


def normalize(formula: str) -> str:
    from app.ai_formula.formula_parser import normalize_formula
    return normalize_formula(formula)
