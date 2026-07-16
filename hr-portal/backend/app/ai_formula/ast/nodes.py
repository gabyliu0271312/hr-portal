# -*- coding: utf-8 -*-
"""AST 节点定义（AST 阶段 3：AST0003）。

所有节点均带 span（字符区间），且可 to_dict() 序列化。
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from .errors import SourceSpan


@dataclass(kw_only=True)
class Node:
    span: SourceSpan

    def to_dict(self) -> dict[str, Any]:
        raise NotImplementedError


@dataclass
class LiteralNode(Node):
    value: Any
    literal_type: str  # "number" | "string" | "boolean" | "null"

    def to_dict(self) -> dict[str, Any]:
        return {
            "type": "Literal",
            "literal_type": self.literal_type,
            "value": self.value,
            "span": self.span.to_dict(),
        }


@dataclass
class FieldRefNode(Node):
    # 原始引用（可能是 alias.col / col / "col" / label）
    raw: str
    alias: str | None = None
    column: str | None = None
    is_field_func: bool = False
    # 语义解析后填充
    resolved_alias: str | None = None
    resolved_column: str | None = None
    data_type: str | None = None
    resolved: bool = False

    def to_dict(self) -> dict[str, Any]:
        d: dict[str, Any] = {
            "type": "FieldRef",
            "raw": self.raw,
            "span": self.span.to_dict(),
        }
        if self.alias is not None:
            d["alias"] = self.alias
        if self.column is not None:
            d["column"] = self.column
        if self.resolved:
            d["resolved_alias"] = self.resolved_alias
            d["resolved_column"] = self.resolved_column
        return d


@dataclass
class FunctionCallNode(Node):
    name: str
    args: list[Node]

    def to_dict(self) -> dict[str, Any]:
        return {
            "type": "FunctionCall",
            "name": self.name,
            "args": [a.to_dict() for a in self.args],
            "span": self.span.to_dict(),
        }


@dataclass
class BinaryOpNode(Node):
    op: str  # + - * / &
    left: Node
    right: Node

    def to_dict(self) -> dict[str, Any]:
        return {
            "type": "BinaryOp",
            "op": self.op,
            "left": self.left.to_dict(),
            "right": self.right.to_dict(),
            "span": self.span.to_dict(),
        }


@dataclass
class UnaryOpNode(Node):
    op: str  # + -
    operand: Node

    def to_dict(self) -> dict[str, Any]:
        return {
            "type": "UnaryOp",
            "op": self.op,
            "operand": self.operand.to_dict(),
            "span": self.span.to_dict(),
        }


@dataclass
class ComparisonNode(Node):
    op: str  # = <> > >= < <=
    left: Node
    right: Node

    def to_dict(self) -> dict[str, Any]:
        return {
            "type": "Comparison",
            "op": self.op,
            "left": self.left.to_dict(),
            "right": self.right.to_dict(),
            "span": self.span.to_dict(),
        }


# 便于直接访问节点类型（如 node.type == "BinaryOp"），
# 不作为 dataclass 字段，仅作类属性。
LiteralNode.type = "Literal"
FieldRefNode.type = "FieldRef"
FunctionCallNode.type = "FunctionCall"
BinaryOpNode.type = "BinaryOp"
UnaryOpNode.type = "UnaryOp"
ComparisonNode.type = "Comparison"
