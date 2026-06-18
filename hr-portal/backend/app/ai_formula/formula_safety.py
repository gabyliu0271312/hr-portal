from __future__ import annotations

from app.ai.deny_patterns import FORMULA_BLOCK_TOKENS, formula_block_issues

# 兼容旧引用：禁止 token 与公式检查统一来自 app.ai.deny_patterns（单一真相源）。
BLOCK_PATTERNS = list(FORMULA_BLOCK_TOKENS)


def safety_issues(formula: str) -> list[str]:
    return formula_block_issues(formula)


def ensure_safe(formula: str) -> None:
    issues = safety_issues(formula)
    if issues:
        raise ValueError("；".join(issues))

