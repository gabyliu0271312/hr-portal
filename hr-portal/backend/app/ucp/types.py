"""UCP 公共类型定义。

把 AdapterResult 等 dataclass 放到独立模块，避免 adapters.py 与 bridge 模块的循环导入。
"""
from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class AdapterResult:
    """适配器执行结果。"""
    status: str  # success / failed / partial_success / offer_not_found
    data: list[dict] = field(default_factory=list)
    row_count: int = 0
    success_count: int = 0
    failed_count: int = 0
    error_code: str | None = None
    error_message: str | None = None
    # 额外上下文信息（如 total、分页信息等）
    extra: dict = field(default_factory=dict)
