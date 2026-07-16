# -*- coding: utf-8 -*-
"""词法分析（AST 阶段 2：AST0002）。

识别：IDENT / NUMBER / STRING / COMMA / LPAREN / RPAREN /
PLUS / MINUS / STAR / SLASH / EQ / NE / GT / GE / LT / LE /
DOT / AMP / TRUE / FALSE / NULL / EOF

约定：
- 标识符可包含中文（CJK）字符，支持 ali.as.字段名 形式。
- 字符串用双引号或单引号包裹；双引号内 "" 表示转义引号。
- 运算符按最长匹配（>=、<=、<>、!= 优先于单字符）。
- 字符串内的逗号、括号、运算符均不拆分。
"""
from __future__ import annotations

from .errors import FormulaCompileError
from .tokens import KEYWORDS, Token, TokenType


class LexError(Exception):
    """词法错误（由 compiler 转换为 FormulaCompileError）。"""

    def __init__(self, message: str, start: int, end: int, fragment: str = ""):
        super().__init__(message)
        self.message = message
        self.start = start
        self.end = end
        self.fragment = fragment


# 起始为字母/下划线/中文的标识符
def _is_ident_start(ch: str) -> bool:
    return ch.isalpha() or ch == "_" or _is_cjk(ch)


def _is_ident_part(ch: str) -> bool:
    return ch.isalnum() or ch == "_" or _is_cjk(ch)


def _is_cjk(ch: str) -> bool:
    if not ch:
        return False
    cp = ord(ch)
    # CJK 统一表意文字 + 常见扩展 + 中文标点之外的汉字
    return (
        0x4E00 <= cp <= 0x9FFF
        or 0x3400 <= cp <= 0x4DBF
        or 0xF900 <= cp <= 0xFAFF
        or 0x3000 <= cp <= 0x303F  # CJK 符号和标点（如 、。）
    )


# 多字符运算符（最长匹配）
_MULTI_OPS = {
    "<=": TokenType.LE,
    ">=": TokenType.GE,
    "<>": TokenType.NE,
    "!=": TokenType.NE,
}


class Lexer:
    def __init__(self, text: str):
        self.text = text
        self.pos = 0
        self.n = len(text)

    def tokenize(self) -> list[Token]:
        tokens: list[Token] = []
        while self.pos < self.n:
            ch = self.text[self.pos]
            if ch in " \t\r\n":
                self.pos += 1
                continue
            # 字符串
            if ch in ('"', "'"):
                tokens.append(self._read_string(ch))
                continue
            # 数字
            if ch.isdigit():
                tokens.append(self._read_number())
                continue
            # 标识符
            if _is_ident_start(ch):
                tokens.append(self._read_ident())
                continue
            # 多字符运算符
            two = self.text[self.pos:self.pos + 2]
            if two in _MULTI_OPS:
                tokens.append(Token(_MULTI_OPS[two], two, self.pos, self.pos + 2))
                self.pos += 2
                continue
            # 单字符
            single = {
                "+": TokenType.PLUS,
                "-": TokenType.MINUS,
                "*": TokenType.STAR,
                "/": TokenType.SLASH,
                "=": TokenType.EQ,
                ">": TokenType.GT,
                "<": TokenType.LT,
                "(": TokenType.LPAREN,
                ")": TokenType.RPAREN,
                ",": TokenType.COMMA,
                ".": TokenType.DOT,
                "&": TokenType.AMP,
            }.get(ch)
            if single is not None:
                tokens.append(Token(single, ch, self.pos, self.pos + 1))
                self.pos += 1
                continue
            raise LexError(
                f"无法识别的字符：{ch!r}",
                self.pos,
                self.pos + 1,
                ch,
            )
        tokens.append(Token(TokenType.EOF, "", self.n, self.n))
        return tokens

    def _read_string(self, quote: str) -> Token:
        start = self.pos
        self.pos += 1  # 跳过起始引号
        buf: list[str] = []
        while self.pos < self.n:
            ch = self.text[self.pos]
            if ch == quote:
                # 双写引号转义（"" 或 ''）
                if self.pos + 1 < self.n and self.text[self.pos + 1] == quote:
                    buf.append(quote)
                    self.pos += 2
                    continue
                self.pos += 1  # 结束引号
                return Token(TokenType.STRING, "".join(buf), start, self.pos)
            buf.append(ch)
            self.pos += 1
        raise LexError("字符串未闭合", start, self.n, "".join(buf))

    def _read_number(self) -> Token:
        start = self.pos
        buf: list[str] = []
        while self.pos < self.n and self.text[self.pos].isdigit():
            buf.append(self.text[self.pos])
            self.pos += 1
        # 小数点 + 数字
        if (
            self.pos < self.n
            and self.text[self.pos] == "."
            and self.pos + 1 < self.n
            and self.text[self.pos + 1].isdigit()
        ):
            buf.append(".")
            self.pos += 1
            while self.pos < self.n and self.text[self.pos].isdigit():
                buf.append(self.text[self.pos])
                self.pos += 1
        return Token(TokenType.NUMBER, "".join(buf), start, self.pos)

    def _read_ident(self) -> Token:
        start = self.pos
        buf: list[str] = []
        while self.pos < self.n and _is_ident_part(self.text[self.pos]):
            buf.append(self.text[self.pos])
            self.pos += 1
        value = "".join(buf)
        tok_type = KEYWORDS.get(value.upper(), TokenType.IDENT)
        return Token(tok_type, value, start, self.pos)
