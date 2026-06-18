from __future__ import annotations

from typing import Any


def build_context_packet(
    *,
    page: dict[str, Any] | None = None,
    permission: dict[str, Any] | None = None,
    data: dict[str, Any] | None = None,
    attachments: list[dict[str, Any]] | None = None,
    domain_context: dict[str, Any] | None = None,
    semantic_layer: dict[str, Any] | None = None,
    query_spec: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """统一构建 Context Packet 五分区。

    page / permission / data / attachments / domain_context 为固定顶层分区。
    semantic_layer 与 query_spec 是 Phase 2 data.query 的预留占位，
    Phase 0/1 不实现编译器，只在 domain_context 下约定结构。
    """
    domain = dict(domain_context or {})
    domain.setdefault("semantic_layer", semantic_layer)
    domain.setdefault("query_spec", query_spec)
    return {
        "page": page or {},
        "permission": permission or {},
        "data": data or {},
        "attachments": attachments or [],
        "domain_context": domain,
    }
