from __future__ import annotations

import re


BLOCK_PATTERNS = [
    "HYPERLINK",
    "WEBSERVICE",
    "IMPORTXML",
    "IMPORTHTML",
    "FILE",
    "SHELL",
    "CMD",
    "EXEC",
    "URL",
    "HTTP://",
    "HTTPS://",
    "\\\\",
    "../",
    "..\\",
]


def safety_issues(formula: str) -> list[str]:
    text = (formula or "").upper()
    issues: list[str] = []
    if len(formula or "") > 2000:
        issues.append("公式长度不能超过 2000 字符")
    for token in BLOCK_PATTERNS:
        if token in text:
            issues.append(f"公式包含不允许的内容: {token}")
    if re.search(r"[A-Za-z]:\\", formula or ""):
        issues.append("公式不能包含本地文件路径")
    return issues


def ensure_safe(formula: str) -> None:
    issues = safety_issues(formula)
    if issues:
        raise ValueError("；".join(issues))

