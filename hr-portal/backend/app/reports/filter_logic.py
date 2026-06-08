"""Shared report filter logic helpers.

The UI stores simple filters as a list and, optionally, a Boolean expression
such as ``(A AND B) OR C``. This module converts that expression into a
SQLAlchemy clause while keeping legacy "all filters are AND" behavior.
"""
from __future__ import annotations

import re
from collections.abc import Callable, Sequence
from typing import Any

from sqlalchemy import and_, or_
from sqlalchemy.sql import ColumnElement


TOKEN_RE = re.compile(r"\s*(AND|OR|\(|\)|[A-Za-z][A-Za-z0-9_]*|\d+)\s*", re.IGNORECASE)


def filter_label(index: int) -> str:
    """Return spreadsheet-style labels: A, B, ..., Z, AA, AB."""
    if index < 0:
        raise ValueError("index must be non-negative")
    n = index
    chars: list[str] = []
    while True:
        chars.append(chr(ord("A") + (n % 26)))
        n = n // 26 - 1
        if n < 0:
            break
    return "".join(reversed(chars))


class FilterLogicParser:
    def __init__(self, expression: str, clauses: dict[str, ColumnElement]):
        self.tokens = self._tokenize(expression)
        self.pos = 0
        self.clauses = clauses
        self.referenced: set[str] = set()

    @staticmethod
    def _tokenize(expression: str) -> list[str]:
        tokens: list[str] = []
        pos = 0
        while pos < len(expression):
            match = TOKEN_RE.match(expression, pos)
            if not match:
                raise ValueError(f"无法识别的筛选逻辑片段：{expression[pos:pos + 12]}")
            tokens.append(match.group(1).upper())
            pos = match.end()
        return tokens

    def parse(self) -> ColumnElement | None:
        if not self.tokens:
            return None
        result = self._parse_or()
        if self.pos != len(self.tokens):
            raise ValueError(f"筛选逻辑存在多余内容：{self.tokens[self.pos]}")
        return result

    def _peek(self) -> str | None:
        return self.tokens[self.pos] if self.pos < len(self.tokens) else None

    def _take(self) -> str:
        token = self.tokens[self.pos]
        self.pos += 1
        return token

    def _parse_or(self) -> ColumnElement:
        parts = [self._parse_and()]
        while self._peek() == "OR":
            self._take()
            parts.append(self._parse_and())
        return or_(*parts) if len(parts) > 1 else parts[0]

    def _parse_and(self) -> ColumnElement:
        parts = [self._parse_factor()]
        while self._peek() == "AND":
            self._take()
            parts.append(self._parse_factor())
        return and_(*parts) if len(parts) > 1 else parts[0]

    def _parse_factor(self) -> ColumnElement:
        token = self._peek()
        if token is None:
            raise ValueError("筛选逻辑不完整")
        if token == "(":
            self._take()
            clause = self._parse_or()
            if self._peek() != ")":
                raise ValueError("筛选逻辑缺少右括号")
            self._take()
            return clause
        if token in {"AND", "OR", ")"}:
            raise ValueError(f"筛选逻辑中 {token} 的位置不正确")
        self._take()
        label = token
        if label.isdigit():
            label = filter_label(int(label) - 1)
        clause = self.clauses.get(label)
        if clause is None:
            raise ValueError(f"筛选逻辑引用了不存在的条件 {token}")
        self.referenced.add(label)
        return clause


def build_filter_clause(
    filters: Sequence[Any],
    make_clause: Callable[[dict[str, Any]], ColumnElement | None],
    filter_logic: dict[str, Any] | None = None,
) -> ColumnElement | None:
    """Build one SQLAlchemy where clause from filters and optional logic.

    When ``filter_logic.expression`` is blank, all valid filters are combined
    with AND for backward compatibility. When an expression is provided,
    unreferenced filters are still AND-ed to the expression. This keeps hidden
    filters and runtime extra filters effective unless the filter itself is
    removed.
    """
    indexed: list[tuple[int, str, ColumnElement]] = []
    for i, raw in enumerate(filters):
        f = raw.model_dump() if hasattr(raw, "model_dump") else dict(raw or {})
        clause = make_clause(f)
        if clause is not None:
            indexed.append((i, filter_label(i), clause))
    if not indexed:
        return None

    expression = ""
    if isinstance(filter_logic, dict):
        expression = str(filter_logic.get("expression") or "").strip()

    if not expression:
        return and_(*(clause for _, _, clause in indexed))

    clauses_by_label = {label: clause for _, label, clause in indexed}
    parser = FilterLogicParser(expression, clauses_by_label)
    parsed = parser.parse()
    if parsed is None:
        return and_(*(clause for _, _, clause in indexed))

    unused = [clause for _, label, clause in indexed if label not in parser.referenced]
    return and_(parsed, *unused) if unused else parsed
