# -*- coding: utf-8 -*-
"""Token 定义（AST 阶段 2：AST0002）。"""
from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Any


class TokenType(str, Enum):
    IDENT = "IDENT"          # 标识符 / 中文字段名 / 函数名
    NUMBER = "NUMBER"        # 123 / 123.45
    STRING = "STRING"        # "正式员工" / '正式员工'
    COMMA = "COMMA"         # ,
    LPAREN = "LPAREN"       # (
    RPAREN = "RPAREN"       # )
    PLUS = "PLUS"           # +
    MINUS = "MINUS"         # -
    STAR = "STAR"           # *
    SLASH = "SLASH"         # /
    EQ = "EQ"               # =
    NE = "NE"               # <> / !=
    GT = "GT"               # >
    GE = "GE"               # >=
    LT = "LT"               # <
    LE = "LE"               # <=
    DOT = "DOT"             # .
    AMP = "AMP"             # &
    TRUE = "TRUE"           # TRUE
    FALSE = "FALSE"         # FALSE
    NULL = "NULL"           # NULL
    EOF = "EOF"             # 结束


# 关键字（IDENT 命中后按小写归一判断）
KEYWORDS = {
    "TRUE": TokenType.TRUE,
    "FALSE": TokenType.FALSE,
    "NULL": TokenType.NULL,
}


@dataclass
class Token:
    type: TokenType
    value: str
    start: int
    end: int

    def to_dict(self) -> dict[str, Any]:
        return {
            "type": self.type.value,
            "value": self.value,
            "start": self.start,
            "end": self.end,
        }
