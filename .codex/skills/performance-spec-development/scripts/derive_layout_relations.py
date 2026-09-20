#!/usr/bin/env python3
"""Project captured spatial constraints into an extracted UI contract."""

from __future__ import annotations

import argparse
import json
from pathlib import Path


def load(path: Path) -> dict:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(f"{path} must contain a JSON object")
    return value


def map_state(value: str, state_map: dict[str, str]) -> str:
    return state_map.get(value, value)


def project(model: dict, state_map: dict[str, str]) -> dict:
    spatial = model.get("derived_spatial_constraints")
    if not isinstance(spatial, dict):
        raise ValueError("capture_model.json is missing derived_spatial_constraints")

    constraints = []
    for item in spatial.get("container_constraints", []):
        if not isinstance(item, dict):
            continue
        projected = dict(item)
        state_id = map_state(str(item.get("state_id", "")), state_map)
        projected["source_state_id"] = state_id
        projected.pop("state_id", None)
        projected.setdefault("component_id", item.get("container_key", "unmapped-container"))
        projected.setdefault("ownership", "parent-container")
        constraints.append(projected)

    invariants = []
    for item in spatial.get("variant_invariants", []):
        if not isinstance(item, dict):
            continue
        projected = dict(item)
        projected["source_state_ids"] = [map_state(str(value), state_map) for value in item.get("source_state_ids", [])]
        projected["measurements"] = {
            map_state(str(key), state_map): value
            for key, value in item.get("measurements", {}).items()
        }
        projected.setdefault("component_id", item.get("container_key", "unmapped-container"))
        projected.setdefault("ownership", "parent-container")
        invariants.append(projected)

    coverage = dict(spatial.get("coverage", {}))
    coverage.setdefault("missing_terminal_anchors", [])
    coverage.setdefault("uncompared_variant_groups", [])
    coverage.setdefault("unmapped_containers", [])
    coverage["states_with_constraints"] = sorted({item["source_state_id"] for item in constraints if item.get("source_state_id")})
    return {
        "container_constraints": constraints,
        "variant_invariants": invariants,
        "spatial_constraint_coverage": coverage,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("capture_model", type=Path)
    parser.add_argument("--state-map", type=Path, help="JSON object mapping capture state ids to source_state_ids")
    parser.add_argument("--contract", type=Path, help="Existing extracted-ui-contract.json to enrich")
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()

    state_map = load(args.state_map) if args.state_map else {}
    fragment = project(load(args.capture_model), {str(key): str(value) for key, value in state_map.items()})
    result = load(args.contract) if args.contract else {}
    result.update(fragment)
    result["schema_version"] = max(2, int(result.get("schema_version", 1) or 1))
    if args.contract and isinstance(result.get("coverage"), dict):
        result["coverage"]["unmapped_spatial_constraints"] = []
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "out": str(args.out),
        "container_constraints": len(fragment["container_constraints"]),
        "variant_invariants": len(fragment["variant_invariants"]),
        "coverage": fragment["spatial_constraint_coverage"],
    }, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
