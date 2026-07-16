# -*- coding: utf-8 -*-
"""编译错误/警告模型（AST 阶段 1：AST0001）。

所有错误必须包含结构化字段：
- code：机器可读错误码
- message：用户可读信息
- start / end：公式中的字符位置（可选）
- fragment：原始片段（可选）
- suggestion：建议修复（可选）
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class SourceSpan:
    """公式中的字符区间 [start, end)。"""

    start: int
    end: int
    fragment: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "start": self.start,
            "end": self.end,
            "fragment": self.fragment,
        }

    def contains(self, other: "SourceSpan | None") -> bool:
        if other is None:
            return False
        return self.start <= other.start and other.end <= self.end


@dataclass
class FormulaCompileError(Exception):
    """结构化编译错误（可抛出，供 except 捕获）。"""

    code: str
    message: str
    start: int | None = None
    end: int | None = None
    fragment: str | None = None
    suggestion: str | None = None
    function: str | None = None
    field: str | None = None

    def to_dict(self) -> dict[str, Any]:
        data: dict[str, Any] = {
            "code": self.code,
            "message": self.message,
        }
        if self.start is not None:
            data["start"] = self.start
        if self.end is not None:
            data["end"] = self.end
        if self.fragment is not None:
            data["fragment"] = self.fragment
        if self.suggestion is not None:
            data["suggestion"] = self.suggestion
        if self.function is not None:
            data["function"] = self.function
        if self.field is not None:
            data["field"] = self.field
        return data


@dataclass
class FormulaCompileWarning:
    """结构化编译警告（不阻断保存）。"""

    code: str
    message: str
    start: int | None = None
    end: int | None = None
    fragment: str | None = None
    suggestion: str | None = None

    def to_dict(self) -> dict[str, Any]:
        data: dict[str, Any] = {
            "code": self.code,
            "message": self.message,
        }
        if self.start is not None:
            data["start"] = self.start
        if self.end is not None:
            data["end"] = self.end
        if self.fragment is not None:
            data["fragment"] = self.fragment
        if self.suggestion is not None:
            data["suggestion"] = self.suggestion
        return data


# 兼容既有 validator 的“字符串错误列表”接口：将结构化错误展平为可读字符串。
def flatten_errors(errors: list[FormulaCompileError]) -> list[str]:
    out: list[str] = []
    for e in errors:
        if e.suggestion:
            out.append(f"{e.message}（建议：{e.suggestion}）")
        else:
            out.append(e.message)
    return out
