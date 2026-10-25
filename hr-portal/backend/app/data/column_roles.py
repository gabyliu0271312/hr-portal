"""列角色：只按代码规则区分技术列与业务列。

`table_columns.is_visible` 历史上把“展示面”和“授权”混在一起。按用户确认的规则，
技术列不再由人工开关维护，而由命名与固定名单判定；它只影响字段面（不进入业务字段
选择器、不能作为业务输出），不承担任何授权语义。
"""
from __future__ import annotations

TECHNICAL_COLUMN_CODES = frozenset({"id", "pk_hash", "synced_at"})
TECHNICAL_PREFIXES = ("raw_", "src_", "_")
TECHNICAL_SUFFIXES = ("_hash",)


def is_technical_column(column_code: str | None) -> bool:
    """技术列判定：固定名单 + 前缀/后缀约定。"""
    code = (column_code or "").strip().lower()
    if not code:
        return True
    if code in TECHNICAL_COLUMN_CODES:
        return True
    if code.startswith(TECHNICAL_PREFIXES):
        return True
    return code.endswith(TECHNICAL_SUFFIXES)
