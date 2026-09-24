#!/usr/bin/env python3
"""Normalize compound widget roots and parts from a captured layout contract."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any


def node_bbox(node: dict[str, Any]) -> dict[str, float] | None:
    raw = node.get("bbox")
    if isinstance(raw, dict) and all(isinstance(raw.get(key), (int, float)) for key in ("x", "y", "width", "height")):
        return {key: raw[key] for key in ("x", "y", "width", "height")}
    if all(isinstance(node.get(key), (int, float)) for key in ("x", "y", "w", "h")):
        return {"x": node["x"], "y": node["y"], "width": node["w"], "height": node["h"]}
    return None


def class_name(node: dict[str, Any]) -> str:
    return str(node.get("class_name") or node.get("className") or "")


def viewport(payload: dict[str, Any]) -> dict[str, Any]:
    raw = payload.get("viewport", {})
    return {
        "width": raw.get("width"),
        "height": raw.get("height"),
        "dpr": raw.get("dpr", raw.get("device_scale_factor")),
    }


def geometry_profile(input_bbox: dict[str, float] | None) -> str:
    if not input_bbox:
        return "unknown"
    if input_bbox["width"] <= 100:
        return "interval"
    if input_bbox["width"] >= 300:
        return "score_bounds"
    return "unknown"


def validate_geometry(root: dict[str, float], input_node: dict[str, float] | None, handle: dict[str, float] | None, handle_items: list[dict[str, float]], svg: list[dict[str, float]], root_id: str, errors: list[str]) -> None:
    if abs(root["height"] - 31) > 1:
        errors.append(f"{root_id}:unexpected_component_root_height:{root['height']}")
    if input_node and abs(input_node["height"] - 22) > 0.5:
        errors.append(f"{root_id}:unexpected_input_height:{input_node['height']}")
    if handle and (abs(handle["width"] - 32) > 0.5 or abs(handle["height"] - 30) > 1):
        errors.append(f"{root_id}:unexpected_handle_geometry:{handle['width']}x{handle['height']}")
    if len(handle_items) != 2:
        errors.append(f"{root_id}:expected_two_handle_items:{len(handle_items)}")
    if len(svg) != 2:
        errors.append(f"{root_id}:expected_two_handle_svgs:{len(svg)}")


def is_descendant(nodes_by_id: dict[str, dict[str, Any]], node: dict[str, Any], ancestor_id: str) -> bool:
    current_id = node.get("parent_id") or node.get("parentId")
    seen: set[str] = set()
    while current_id and str(current_id) not in seen:
        current = str(current_id)
        if current == ancestor_id:
            return True
        seen.add(current)
        parent = nodes_by_id.get(current)
        if not parent:
            return False
        current_id = parent.get("parent_id") or parent.get("parentId")
    return False


def descendants(nodes_by_id: dict[str, dict[str, Any]], root_id: str) -> list[dict[str, Any]]:
    children: dict[str, list[dict[str, Any]]] = {}
    for node in nodes_by_id.values():
        parent_id = node.get("parent_id") or node.get("parentId")
        if parent_id:
            children.setdefault(str(parent_id), []).append(node)
    result: list[dict[str, Any]] = []
    pending = list(children.get(root_id, []))
    while pending:
        node = pending.pop(0)
        result.append(node)
        pending.extend(children.get(str(node.get("id")), []))
    return result


def part(node: dict[str, Any], bbox_role: str, computed_by_id: dict[str, dict[str, Any]]) -> dict[str, Any]:
    node_id = str(node.get("id"))
    computed = computed_by_id.get(node_id, {})
    return {
        "id": node.get("id"),
        "bbox_role": bbox_role,
        "bbox": node_bbox(node),
        "tag": node.get("tag"),
        "class_name": class_name(node),
        "data_icon": node.get("data_icon") or node.get("data-icon") or "",
        "parent_id": node.get("parent_id") or node.get("parentId"),
        "styles": computed.get("style", {}) if isinstance(computed, dict) else {},
    }


def normalize(payload: dict[str, Any], source_state_id: str = "", computed: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    raw_nodes = payload.get("bbox_inventory") or payload.get("layout_roots", [])
    nodes = [node for node in raw_nodes if isinstance(node, dict) and node.get("id")]
    nodes_by_id = {str(node["id"]): node for node in nodes}
    computed_by_id = {str(node.get("id")): node for node in (computed or []) if isinstance(node, dict) and node.get("id")}
    effective_state_id = source_state_id or str(payload.get("source_state_id") or "")
    captured_viewport = viewport(payload)
    controls: list[dict[str, Any]] = []
    errors: list[str] = []
    if not all(isinstance(captured_viewport.get(key), (int, float)) for key in ("width", "height", "dpr")):
        errors.append("capture:missing_numeric_viewport_width_height_dpr")

    for root in nodes:
        root_class = class_name(root)
        if "ud__input-number" not in root_class or "__input-wrap" in root_class or "__handle" in root_class:
            continue
        root_id = str(root["id"])
        root_bbox = node_bbox(root)
        if root_bbox is None:
            errors.append(f"{root_id}:missing_component_root_bbox")
            continue
        child_nodes = descendants(nodes_by_id, root_id)
        input_wrap = next((node for node in child_nodes if "ud__input-number__input-wrap" in class_name(node)), None)
        input_node = next((node for node in child_nodes if str(node.get("tag", "")).lower() == "input" and "ud__native-input" in class_name(node)), None)
        handle = next((node for node in child_nodes if "ud__input-number__handle" in class_name(node) and "handle-item" not in class_name(node)), None)
        handle_items = [node for node in child_nodes if "ud__input-number__handle-item" in class_name(node)]
        icons = [node for node in child_nodes if str(node.get("tag", "")).lower() == "svg"]
        required = {"input_wrap": input_wrap, "input": input_node, "handle": handle}
        for name, node in required.items():
            if node is None:
                errors.append(f"{root_id}:missing_part:{name}")
            elif node_bbox(node) is None:
                errors.append(f"{root_id}:{name}:missing_bbox")
        root_box = node_bbox(root)
        input_box = node_bbox(input_node) if input_node else None
        handle_box = node_bbox(handle) if handle else None
        item_boxes = [node_bbox(node) for node in handle_items if node_bbox(node)]
        svg_boxes = [node_bbox(node) for node in icons if node_bbox(node)]
        if root_box and input_box and handle_box:
            validate_geometry(root_box, input_box, handle_box, item_boxes, svg_boxes, root_id, errors)
        if input_wrap and str(input_wrap.get("parent_id") or input_wrap.get("parentId")) != root_id:
            errors.append(f"{root_id}:input_wrap_parent_mismatch")
        if input_node and input_wrap and str(input_node.get("parent_id") or input_node.get("parentId")) != str(input_wrap.get("id")):
            errors.append(f"{root_id}:input_parent_mismatch")
        if handle and str(handle.get("parent_id") or handle.get("parentId")) != root_id:
            errors.append(f"{root_id}:handle_parent_mismatch")
        handle_item_ids = {str(node.get("id")) for node in handle_items}
        if any(not any(is_descendant(nodes_by_id, node, item_id) for item_id in handle_item_ids) for node in icons):
            errors.append(f"{root_id}:svg_parent_mismatch")
        controls.append({
            "component_id": "PerformanceNumberInput",
            "source_state_id": effective_state_id,
            "state": "disabled" if "ud__input-number--disabled" in root_class else "default",
            "variant": {
                "id": geometry_profile(input_box),
                "class_name": root_class,
                "viewport": captured_viewport,
            },
            "root": part(root, "component_root", computed_by_id),
            "parts": {
                "input_wrap": part(input_wrap, "container_part", computed_by_id) if input_wrap else None,
                "input": part(input_node, "input", computed_by_id) if input_node else None,
                "handle": part(handle, "handle", computed_by_id) if handle else None,
                "handle_items": [part(node, "handle_item", computed_by_id) for node in handle_items],
                "svg": [part(node, "svg", computed_by_id) for node in icons],
            },
        })

    return {
        "schema_version": 1,
        "source_state_id": effective_state_id,
        "source_artifact": "bbox_inventory" if payload.get("bbox_inventory") else "layout_roots",
        "compound_controls": controls,
        "errors": errors,
        "status": "complete" if controls and not errors else "blocked",
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("target_contract", type=Path)
    parser.add_argument("--source-state-id", default="")
    parser.add_argument("--computed", type=Path)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    try:
        payload = json.loads(args.target_contract.read_text(encoding="utf-8"))
        if not isinstance(payload, dict):
            raise ValueError("target contract must be an object")
        computed = None
        if args.computed:
            computed = json.loads(args.computed.read_text(encoding="utf-8"))
            if not isinstance(computed, list):
                raise ValueError("computed contract must be an array")
        result = normalize(payload, args.source_state_id, computed)
    except (OSError, json.JSONDecodeError, ValueError) as exc:
        print(json.dumps({"status": "blocked", "errors": [str(exc)]}, ensure_ascii=False, indent=2))
        return 1
    output = json.dumps(result, ensure_ascii=False, indent=2)
    if args.output:
        args.output.write_text(output + "\n", encoding="utf-8")
    else:
        print(output)
    return 0 if result["status"] == "complete" else 1


if __name__ == "__main__":
    sys.exit(main())
