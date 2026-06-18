from __future__ import annotations

import re

# ──────────────────────────────────────────────────────────────────────────
# AI 输出禁止内容的单一真相源（single source of truth）。
# 公式安全校验（formula_safety）与通用输出闸（policy_guard）都从这里取，
# 避免两套"禁止内容"定义各自维护、漏改一处。
# data.query 的"禁止模型输出 SQL/表名/join"也复用本模块。
# ──────────────────────────────────────────────────────────────────────────

# 通用输出闸：对模型输出文本做正则匹配，按能力 policy_profile.deny_patterns 启用。
DENY_PATTERN_REGEX: dict[str, re.Pattern[str]] = {
    "sql": re.compile(
        r"\b(select|insert|update|delete|drop|truncate|union|join|where|from)\b",
        re.IGNORECASE,
    ),
    "code": re.compile(r"(import\s+|exec\s*\(|eval\s*\(|os\.|subprocess|__\w+__)", re.IGNORECASE),
    "url": re.compile(r"https?://", re.IGNORECASE),
    "external_link": re.compile(r"https?://", re.IGNORECASE),
    "file_path": re.compile(r"([a-zA-Z]:\\|\.\./|/etc/|/var/|/root/)"),
    "macro": re.compile(r"(HYPERLINK|WEBSERVICE|DDE|=cmd\|)", re.IGNORECASE),
}


def output_deny_hits(text: str | None, patterns: list[str]) -> list[str]:
    """返回 text 命中的 deny 模式名列表（按传入的 patterns 过滤）。"""
    payload = text or ""
    return [
        name
        for name in patterns
        if name in DENY_PATTERN_REGEX and DENY_PATTERN_REGEX[name].search(payload)
    ]


# 公式专用禁止 token：在公式文本（大写后）中出现即拒。
FORMULA_BLOCK_TOKENS: tuple[str, ...] = (
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
)

_LOCAL_PATH_RE = re.compile(r"[A-Za-z]:\\")


def formula_block_issues(formula: str) -> list[str]:
    """公式危险内容检查，返回中文问题描述（保持原有报错文案，供失败分类匹配）。"""
    text = (formula or "").upper()
    issues: list[str] = []
    if len(formula or "") > 2000:
        issues.append("公式长度不能超过 2000 字符")
    for token in FORMULA_BLOCK_TOKENS:
        if token in text:
            issues.append(f"公式包含不允许的内容: {token}")
    if _LOCAL_PATH_RE.search(formula or ""):
        issues.append("公式不能包含本地文件路径")
    return issues
