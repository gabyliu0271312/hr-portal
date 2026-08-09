"""受控正则表达式校验，阻断明显的 ReDoS 风险。"""
from __future__ import annotations

import re


_MAX_PATTERN_LENGTH = 200
_NESTED_QUANTIFIER_RE = re.compile(r"(?:[+*}]|\\d+})[+*?{]")
_GROUP_QUANTIFIER_RE = re.compile(r"\([^\n]*[+*][^\n]*\)[+*{]")
_AMBIGUOUS_GROUP_RE = re.compile(r"\([^\n)]*\|[^\n)]*\)[+*{]")
_BACKREFERENCE_RE = re.compile(r"\\(?:[1-9]|k<[^>]+>)")
_LOOKBEHIND_RE = re.compile(r"\(\?<=[^)]*\)|\(\?<![^)]*\)")


def validate_safe_pattern(pattern: str) -> str:
    """校验并返回可执行 pattern；拒绝高风险结构而不是猜测修复。"""
    if not isinstance(pattern, str):
        raise ValueError("正则表达式必须是字符串")
    if len(pattern) > _MAX_PATTERN_LENGTH:
        raise ValueError("正则表达式过长")
    if _BACKREFERENCE_RE.search(pattern):
        raise ValueError("正则表达式不允许反向引用")
    if _LOOKBEHIND_RE.search(pattern):
        raise ValueError("正则表达式不允许后行断言")
    if (
        _NESTED_QUANTIFIER_RE.search(pattern)
        or _GROUP_QUANTIFIER_RE.search(pattern)
        or _AMBIGUOUS_GROUP_RE.search(pattern)
    ):
        raise ValueError("正则表达式包含高风险嵌套或歧义量词")
    try:
        re.compile(pattern)
    except re.error as exc:
        raise ValueError(f"正则表达式无效: {exc}") from exc
    return pattern
