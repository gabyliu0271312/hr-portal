"""Single source of truth for visual pipeline nodes."""
from __future__ import annotations

from typing import Any


NODE_CATALOG: dict[str, dict[str, Any]] = {
    "START_TRIGGER": {"code": "N01", "label": "\u6d41\u7a0b\u8d77\u70b9", "category": "trigger", "color": "#1f8f6f", "icon": "VideoPlay", "palette": True, "locked": False, "config_schema": {"trigger_types": "entry modes"}},
    "CONNECTOR": {"code": "N02", "label": "\u8d44\u6e90\u8c03\u7528", "category": "integration", "color": "#409eff", "icon": "Connection", "palette": True, "config_schema": {"system_id": "system", "resource_id": "verified resource", "params": "parameters JSON"}},
    "CAPABILITY": {"code": "N03", "label": "\u4e1a\u52a1\u80fd\u529b", "category": "integration", "color": "#8e44ad", "icon": "Connection", "palette": True, "config_schema": {"system_id": "system", "object_code": "object", "capability_id": "verified capability"}},
    "CAPABILITY_LOOKUP": {"code": "N04", "label": "\u9010\u6761\u67e5\u8be2", "category": "integration", "color": "#8e44ad", "icon": "Search", "palette": True, "config_schema": {"input_key": "input records", "lookup_field": "lookup field", "capability_id": "lookup capability"}},
    "TRANSFORM": {"code": "N05", "label": "\u5b57\u6bb5\u8f6c\u6362", "category": "data", "color": "#e6a23c", "icon": "MagicStick", "palette": True, "config_schema": {"mappings": "field mappings"}},
    "RECORD_MERGE": {"code": "N06", "label": "\u8bb0\u5f55\u5408\u5e76", "category": "data", "color": "#e6a23c", "icon": "Collection", "palette": True, "config_schema": {"input_key": "input records", "field_mapping": "merge mappings"}},
    "WAREHOUSE_ASSET_SINK": {"code": "N07", "label": "\u8d44\u4ea7\u5199\u5165", "category": "data", "color": "#16a085", "icon": "DataBoard", "palette": True, "config_schema": {"input_key": "input records", "target_asset": "target asset", "write_mode": "write mode"}},
    "BRANCH": {"code": "N08", "label": "\u6761\u4ef6\u5206\u652f", "category": "control", "color": "#909399", "icon": "Share", "palette": True, "config_schema": {"condition": "condition expression"}},
    "LOOP": {"code": "N09", "label": "\u5217\u8868\u5faa\u73af", "category": "control", "color": "#67c23a", "icon": "Refresh", "palette": True, "config_schema": {"loop_input": "loop input", "item_key_field": "item key"}},
    "WAIT": {"code": "N10", "label": "\u5ef6\u65f6\u7b49\u5f85", "category": "control", "color": "#b37feb", "icon": "Clock", "palette": True, "config_schema": {"wait_type": "wait type", "wait_duration_seconds": "wait seconds"}},
    "TIME_STRATEGY": {"code": "N11", "label": "\u65f6\u95f4\u7b56\u7565", "category": "control", "color": "#13a8a8", "icon": "Clock", "palette": True, "config_schema": {"strategy": "time strategy", "effective_time_field": "effective-time field"}},
    "APPROVAL": {"code": "N12", "label": "\u4eba\u5de5\u5ba1\u6279", "category": "control", "color": "#fa8c16", "icon": "UserFilled", "palette": True, "config_schema": {"approvers": "approvers", "approval_mode": "approval mode", "reason": "approval reason"}},
    "NOTIFY": {"code": "N13", "label": "\u6d88\u606f\u901a\u77e5", "category": "control", "color": "#f56c6c", "icon": "BellFilled", "palette": True, "config_schema": {"template_id": "notification template", "receivers": "receivers"}},
}

NODE_TYPES = set(NODE_CATALOG)
START_TRIGGER_TYPES = {"WEBHOOK", "SCHEDULE", "MANUAL", "PLATFORM_EVENT"}


def canonical_node_label(node_type: str) -> str:
    """Return the required four-character visual type name."""
    return NODE_CATALOG[node_type]["label"]


def normalize_node_display(node_type: str, label: str, config: dict[str, Any]) -> tuple[str, dict[str, Any]]:
    """Separate the fixed visual type name from an optional business alias."""
    normalized_config = dict(config)
    canonical_label = canonical_node_label(node_type)
    legacy_label = label.strip()
    alias = normalized_config.get("business_alias")
    if alias is not None and (not isinstance(alias, str) or len(alias.strip()) > 64):
        raise ValueError("business_alias must be a string with at most 64 characters")
    if legacy_label and legacy_label != canonical_label and not normalized_config.get("business_alias"):
        normalized_config["business_alias"] = legacy_label[:64]
    if isinstance(normalized_config.get("business_alias"), str):
        normalized_config["business_alias"] = normalized_config["business_alias"].strip()
        if not normalized_config["business_alias"]:
            normalized_config.pop("business_alias")
    return canonical_label, normalized_config


def node_type_metadata(*, palette_only: bool = False) -> list[dict[str, Any]]:
    return [
        {"type": node_type, **metadata}
        for node_type, metadata in NODE_CATALOG.items()
        if not palette_only or metadata["palette"]
    ]
