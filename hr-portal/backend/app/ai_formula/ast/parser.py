# -*- coding: utf-8 -*-
"""语法分析（AST 阶段 4-5：AST0004 / AST0005）。

递归下降解析器：
- 优先级（高→低）：函数调用 / 括号 > 一元 +/- > * / > + - > 比较 > &
- 支持 COUNT(*) / FIELD("x") / 嵌套函数 / 多参数
- 语法错误返回带位置的 FormulaCompileError
"""
from __future__ import annotations

from .errors import FormulaCompileError, SourceSpan
from .lexer import LexError, Lexer
from .nodes import (
    BinaryOpNode,
    ComparisonNode,
    FieldRefNode,
    FunctionCallNode,
    LiteralNode,
    Node,
    UnaryOpNode,
)
from .tokens import Token, TokenType


class ParseError(Exception):
    def __init__(self, error: FormulaCompileError):
        super().__init__(error.message)
        self.error = error


_COMPARISON_OPS = {
    TokenType.EQ: "=",
    TokenType.NE: "<>",
    TokenType.GT: ">",
    TokenType.GE: ">=",
    TokenType.LT: "<",
    TokenType.LE: "<=",
}


class Parser:
    def __init__(self, tokens: list[Token]):
        self.tokens = tokens
        self.i = 0

    def _peek(self, offset: int = 0) -> Token:
        idx = self.i + offset
        if idx >= len(self.tokens):
            return self.tokens[-1]
        return self.tokens[idx]

    @property
    def cur(self) -> Token:
        return self._peek(0)

    def _advance(self) -> Token:
        tok = self.cur
        if self.i < len(self.tokens) - 1:
            self.i += 1
        return tok

    def _error(self, code: str, message: str, tok: Token, suggestion: str | None = None) -> ParseError:
        return ParseError(
            FormulaCompileError(
                code=code,
                message=message,
                start=tok.start,
                end=tok.end,
                fragment=tok.value,
                suggestion=suggestion,
            )
        )

    # ---- 顶层 ----
    def parse_formula(self) -> Node:
        if self.cur.type == TokenType.EOF:
            raise self._error(
                "syntax_empty_formula",
                "公式为空或无有效表达式",
                self.cur,
                suggestion="请输入有效的 Excel 风格公式，例如 =COUNTIF(current.员工类型,\"正式员工\")",
            )
        node = self.parse_concat()
        if self.cur.type != TokenType.EOF:
            raise self._error(
                "syntax_unexpected_token",
                f"公式存在多余内容：{self.cur.value!r}",
                self.cur,
                suggestion="请检查括号是否匹配或运算符是否多余",
            )
        return node

    # ---- & ----
    def parse_concat(self) -> Node:
        node = self.parse_comparison()
        while self.cur.type == TokenType.AMP:
            op_tok = self._advance()
            right = self.parse_comparison()
            node = BinaryOpNode(
                "&", node, right,
                span=SourceSpan(node.span.start, right.span.end),
            )
        return node

    # ---- 比较 ----
    def parse_comparison(self) -> Node:
        node = self.parse_addsub()
        while self.cur.type in _COMPARISON_OPS:
            op_tok = self._advance()
            op = _COMPARISON_OPS[op_tok.type]
            right = self.parse_addsub()
            node = ComparisonNode(
                op, node, right,
                span=SourceSpan(node.span.start, right.span.end),
            )
        return node

    # ---- + - ----
    def parse_addsub(self) -> Node:
        node = self.parse_muldiv()
        while self.cur.type in (TokenType.PLUS, TokenType.MINUS):
            op_tok = self._advance()
            op = "+" if op_tok.type == TokenType.PLUS else "-"
            right = self.parse_muldiv()
            node = BinaryOpNode(
                op, node, right,
                span=SourceSpan(node.span.start, right.span.end),
            )
        return node

    # ---- * / ----
    def parse_muldiv(self) -> Node:
        node = self.parse_unary()
        while self.cur.type in (TokenType.STAR, TokenType.SLASH):
            op_tok = self._advance()
            op = "*" if op_tok.type == TokenType.STAR else "/"
            right = self.parse_unary()
            node = BinaryOpNode(
                op, node, right,
                span=SourceSpan(node.span.start, right.span.end),
            )
        return node

    # ---- 一元 +/- ----
    def parse_unary(self) -> Node:
        if self.cur.type in (TokenType.PLUS, TokenType.MINUS):
            op_tok = self._advance()
            op = "+" if op_tok.type == TokenType.PLUS else "-"
            operand = self.parse_unary()
            return UnaryOpNode(op, operand, span=SourceSpan(op_tok.start, operand.span.end))
        return self.parse_primary()

    # ---- 基础单元 ----
    def parse_primary(self) -> Node:
        tok = self.cur
        if tok.type == TokenType.EOF:
            raise self._error(
                "syntax_expected_operand",
                "公式不完整：缺少操作数",
                tok,
                suggestion="请补全公式，例如 =SUM(字段)",
            )
        if tok.type == TokenType.LPAREN:
            self._advance()
            inner = self.parse_concat()
            if self.cur.type != TokenType.RPAREN:
                raise self._error(
                    "syntax_unclosed_parenthesis",
                    "括号未闭合（缺少 )）",
                    self.cur,
                    suggestion="请检查左括号是否都有对应的右括号",
                )
            self._advance()
            return inner
        if tok.type == TokenType.RPAREN:
            raise self._error(
                "syntax_unexpected_rparen",
                "出现多余的右括号 )",
                tok,
                suggestion="请删除多余的右括号，或补全对应的左括号",
            )
        if tok.type == TokenType.COMMA:
            raise self._error(
                "syntax_unexpected_comma",
                "出现多余的逗号",
                tok,
                suggestion="请检查函数参数之间是否多写了逗号",
            )
        if tok.type == TokenType.NUMBER:
            self._advance()
            text = tok.value
            value: int | float = float(text) if "." in text else int(text)
            return LiteralNode(value, "number", span=SourceSpan(tok.start, tok.end))
        if tok.type == TokenType.STRING:
            self._advance()
            return LiteralNode(tok.value, "string", span=SourceSpan(tok.start, tok.end))
        if tok.type == TokenType.TRUE:
            self._advance()
            return LiteralNode(True, "boolean", span=SourceSpan(tok.start, tok.end))
        if tok.type == TokenType.FALSE:
            self._advance()
            return LiteralNode(False, "boolean", span=SourceSpan(tok.start, tok.end))
        if tok.type == TokenType.NULL:
            self._advance()
            return LiteralNode(None, "null", span=SourceSpan(tok.start, tok.end))
        if tok.type == TokenType.STAR:
            # COUNT(*) 中的 * 表示“所有行”
            self._advance()
            return LiteralNode("*", "star", span=SourceSpan(tok.start, tok.end))
        if tok.type == TokenType.IDENT:
            return self._parse_ident(tok)
        raise self._error(
            "syntax_unexpected_token",
            f"无法解析的记号：{tok.value!r}",
            tok,
        )

    def _parse_ident(self, tok: Token) -> Node:
        name = tok.value
        start = tok.start
        # 函数调用
        if self._peek(1).type == TokenType.LPAREN:
            return self._parse_function_call(name, start)
        # 限定字段 alias.column
        if self._peek(1).type == TokenType.DOT:
            self._advance()  # name
            dot = self._advance()  # .
            col_tok = self.cur
            if col_tok.type != TokenType.IDENT:
                raise self._error(
                    "syntax_expected_field",
                    "字段名后缺少列名",
                    col_tok,
                    suggestion="请使用 alias.列名 或 列名 的形式引用字段",
                )
            self._advance()
            raw = f"{name}.{col_tok.value}"
            return FieldRefNode(
                raw=raw,
                alias=name,
                column=col_tok.value,
                span=SourceSpan(start, col_tok.end),
            )
        # 裸字段
        self._advance()
        return FieldRefNode(raw=name, span=SourceSpan(start, tok.end))

    def _parse_function_call(self, name: str, start: int) -> Node:
        self._advance()  # name
        self._advance()  # (
        args: list[Node] = []
        if self.cur.type != TokenType.RPAREN:
            args.append(self.parse_concat())
            while self.cur.type == TokenType.COMMA:
                self._advance()
                args.append(self.parse_concat())
        if self.cur.type != TokenType.RPAREN:
            raise self._error(
                "syntax_unclosed_parenthesis",
                f"函数 {name} 括号未闭合（缺少 )）",
                self.cur,
                suggestion=f"请在 {name}( 后补全参数并加上 )",
            )
        end = self.cur.end
        self._advance()  # )
        return FunctionCallNode(name, args, span=SourceSpan(start, end))


def parse(text: str) -> Node:
    try:
        tokens = Lexer(text).tokenize()
    except LexError as e:
        raise ParseError(
            FormulaCompileError(
                code="lex_error",
                message=e.message,
                start=e.start,
                end=e.end,
                fragment=e.fragment,
            )
        ) from e
    return Parser(tokens).parse_formula()
