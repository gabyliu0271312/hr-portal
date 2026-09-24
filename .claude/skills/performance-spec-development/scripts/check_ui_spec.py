#!/usr/bin/env python3
"""Validate a performance UI spec before implementation or acceptance."""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

REQUIRED_FILES = (
    "spec.md",
    "capture-manifest.md",
    "capture-completion-checklist.md",
    "component-model.md",
    "pixel-contract.md",
    "acceptance-contract.md",
    "atomic-tasks.md",
    "extracted-ui-contract.json",
)
STATUS_RE = re.compile(r"^[>\s]*(completion_status|pixel_restore_status):\s*(\S+)", re.MULTILINE)
TASK_RE = re.compile(r"^- \[([ xX])\] (PM-[A-Z0-9]+-T\d+)", re.MULTILINE)
STATE_RE = re.compile(r"`(RR-[A-Z0-9-]+)`")
SUMMARY_VALUES = {"captured", "observed", "exists", "available", "same", "default", "N/A", "n/a"}
STYLE_KEYS = ("display", "position", "boxSizing", "backgroundColor", "color", "fontSize", "fontWeight", "lineHeight", "border", "borderRadius", "boxShadow", "overflowX", "overflowY", "zIndex")
VISUAL_STYLE_KEYS = ("display", "width", "height", "margin-left", "font-family", "font-size", "font-weight", "line-height", "align-items")
RELATION_KEYS = ("id", "source_state_ids", "left", "right", "property", "operator", "expected", "evidence")
INTERACTION_KEYS = ("component_id", "control", "resizable", "states")
CONTAINER_CONSTRAINT_KEYS = ("id", "source_state_id", "component_id", "container", "first_visible_child", "terminal_visible_child", "edge_insets", "evidence", "ownership")
VARIANT_INVARIANT_KEYS = ("id", "component_id", "source_state_ids", "property", "measurements", "expected", "tolerance", "invariant_across_variants", "evidence", "ownership")
VARIANT_CONTRACT_KEYS = ("variant_key", "entry_mode", "review_type", "config_discriminator", "source_state_ids", "visible_elements", "forbidden_elements", "line_groups", "component_ownership")
READINESS_KEYS = ("capture_integrity", "capture_completeness", "implementation_readiness", "readiness_scope", "target_variant_keys", "blockers", "evidence")
SPATIAL_COVERAGE_ARRAYS = ("missing_terminal_anchors", "uncompared_variant_groups", "unmapped_containers")
WAIVER_FILENAME = "ui-gate-waivers.json"


def check_bbox(value: object, path: str, errors: list[str]) -> None:
    if not isinstance(value, dict):
        errors.append(f"{path}:must_be_object")
        return
    for key in ("x", "y", "width", "height"):
        if not isinstance(value.get(key), (int, float)):
            errors.append(f"{path}.{key}:must_be_numeric")


def check_styles(value: object, path: str, errors: list[str]) -> None:
    if not isinstance(value, dict):
        errors.append(f"{path}:must_be_object")
        return
    for key in STYLE_KEYS:
        if key not in value:
            errors.append(f"{path}:missing:{key}")

def check_visual_element(value: object, path: str, errors: list[str]) -> None:
    if not isinstance(value, dict):
        errors.append(f"{path}:must_be_object")
        return
    for key in ("id", "role", "anchor", "bbox", "styles", "state", "source_state_ids", "evidence", "parent_structure"):
        if key not in value:
            errors.append(f"{path}:missing:{key}")
    check_bbox(value.get("bbox"), f"{path}.bbox", errors)
    styles = value.get("styles")
    if not isinstance(styles, dict):
        errors.append(f"{path}.styles:must_be_object")
    else:
        for key in VISUAL_STYLE_KEYS:
            if key not in styles:
                errors.append(f"{path}.styles:missing:{key}")
    if not isinstance(value.get("parent_structure"), (dict, str)):
        errors.append(f"{path}.parent_structure:must_be_object_or_explicit_status")
    if not isinstance(value.get("source_state_ids"), list) or not value.get("source_state_ids"):
        errors.append(f"{path}.source_state_ids:must_be_non_empty_array")
    if not isinstance(value.get("evidence"), str) or not value.get("evidence"):
        errors.append(f"{path}.evidence:must_be_non_empty_path")


def check_compound_part(value: object, path: str, expected_role: str, errors: list[str]) -> None:
    if not isinstance(value, dict):
        errors.append(f"{path}:must_be_object")
        return
    for key in ("id", "bbox_role", "bbox", "parent_id", "source_state_id", "evidence"):
        if key not in value:
            errors.append(f"{path}:missing:{key}")
    if value.get("bbox_role") != expected_role:
        errors.append(f"{path}.bbox_role:expected_{expected_role}")
    check_bbox(value.get("bbox"), f"{path}.bbox", errors)


def check_compound_controls(contract: dict[str, object], errors: list[str]) -> None:
    controls = contract.get("compound_controls", [])
    if controls is None:
        controls = []
    if "compound_controls" not in contract:
        visual_elements = [visual for state in contract.get("states", []) if isinstance(state, dict) for visual in state.get("visual_elements", []) if isinstance(visual, dict)]
        if any("input-number" in json.dumps(visual, ensure_ascii=False) for visual in visual_elements):
            errors.append("compound_controls:required_when_compound_widget_present")
    if not isinstance(controls, list):
        errors.append("compound_controls:must_be_array")
        return
    for index, control in enumerate(controls):
        path = f"compound_controls[{index}]"
        if not isinstance(control, dict):
            errors.append(f"{path}:must_be_object")
            continue
        for key in ("component_id", "source_state_ids", "variant", "state", "root", "parts"):
            if key not in control:
                errors.append(f"{path}:missing:{key}")
        source_states = control.get("source_state_ids")
        if not isinstance(source_states, list) or not source_states:
            errors.append(f"{path}.source_state_ids:must_be_non_empty_array")
        if not isinstance(control.get("state"), str) or not control.get("state"):
            errors.append(f"{path}.state:must_be_non_empty_string")
        variant = control.get("variant")
        if not isinstance(variant, dict):
            errors.append(f"{path}.variant:must_be_object")
        else:
            captured_viewport = variant.get("viewport")
            if not isinstance(captured_viewport, dict) or not all(isinstance(captured_viewport.get(key), (int, float)) for key in ("width", "height", "dpr")):
                errors.append(f"{path}.variant.viewport:must_have_numeric_width_height_dpr")
        check_compound_part(control.get("root"), f"{path}.root", "component_root", errors)
        parts = control.get("parts")
        if not isinstance(parts, dict):
            errors.append(f"{path}.parts:must_be_object")
            continue
        for part_name, role in (("input_wrap", "container_part"), ("input", "input"), ("handle", "handle")):
            check_compound_part(parts.get(part_name), f"{path}.parts.{part_name}", role, errors)
        for part_name, role in (("handle_items", "handle_item"), ("svg", "svg")):
            part_list = parts.get(part_name)
            if not isinstance(part_list, list):
                errors.append(f"{path}.parts.{part_name}:must_be_array")
                continue
            for part_index, item in enumerate(part_list):
                check_compound_part(item, f"{path}.parts.{part_name}[{part_index}]", role, errors)
        if isinstance(source_states, list):
            for part_name, part_value in [("root", control.get("root")), ("input_wrap", parts.get("input_wrap") if isinstance(parts, dict) else None), ("input", parts.get("input") if isinstance(parts, dict) else None), ("handle", parts.get("handle") if isinstance(parts, dict) else None)]:
                if isinstance(part_value, dict) and part_value.get("source_state_id") not in source_states:
                    errors.append(f"{path}.{part_name}.source_state_id:not_in_control_source_states")
        if control.get("component_id") == "PerformanceNumberInput" and isinstance(parts, dict):
            root_bbox = control.get("root", {}).get("bbox") if isinstance(control.get("root"), dict) else None
            input_bbox = parts.get("input", {}).get("bbox") if isinstance(parts.get("input"), dict) else None
            handle_bbox = parts.get("handle", {}).get("bbox") if isinstance(parts.get("handle"), dict) else None
            if isinstance(root_bbox, dict) and isinstance(input_bbox, dict) and root_bbox == input_bbox:
                errors.append(f"{path}.root.bbox:must_not_reuse_input_bbox")
            if isinstance(root_bbox, dict) and isinstance(root_bbox.get("height"), (int, float)) and abs(root_bbox["height"] - 31) > 1:
                errors.append(f"{path}.root.bbox.height:expected_about_31")
            if isinstance(input_bbox, dict) and isinstance(input_bbox.get("height"), (int, float)) and abs(input_bbox["height"] - 22) > 0.5:
                errors.append(f"{path}.parts.input.bbox.height:expected_22")
            if isinstance(handle_bbox, dict) and (abs(handle_bbox.get("width", 0) - 32) > 0.5 or abs(handle_bbox.get("height", 0) - 30) > 1):
                errors.append(f"{path}.parts.handle.bbox:expected_32x30")
            if isinstance(parts.get("handle_items"), list) and len(parts["handle_items"]) != 2:
                errors.append(f"{path}.parts.handle_items:expected_two_items")
            if isinstance(parts.get("svg"), list) and len(parts["svg"]) != 2:
                errors.append(f"{path}.parts.svg:expected_two_svgs")

def check_svg(value: object, path: str, errors: list[str]) -> None:
    if not isinstance(value, dict):
        errors.append(f"{path}:must_be_object")
        return
    for key in ("data_icon", "viewBox", "path", "bbox"):
        if not value.get(key):
            errors.append(f"{path}:missing:{key}")
    check_bbox(value.get("bbox"), f"{path}.bbox", errors)


def check_layout_relations(contract: dict[str, object], errors: list[str]) -> None:
    relations = contract.get("layout_relations")
    if not isinstance(relations, list):
        errors.append("layout_relations:must_be_array")
        return
    for index, relation in enumerate(relations):
        path = f"layout_relations[{index}]"
        if not isinstance(relation, dict):
            errors.append(f"{path}:must_be_object")
            continue
        for key in RELATION_KEYS:
            if key not in relation:
                errors.append(f"{path}:missing:{key}")
        if not isinstance(relation.get("source_state_ids"), list) or not relation.get("source_state_ids"):
            errors.append(f"{path}.source_state_ids:must_be_non_empty_array")
        if relation.get("operator") not in {"equal", "not_equal", "less_than", "less_or_equal", "greater_than", "greater_or_equal"}:
            errors.append(f"{path}.operator:unsupported")
        if not isinstance(relation.get("evidence"), str) or not relation.get("evidence"):
            errors.append(f"{path}.evidence:must_be_non_empty_path")
        expected = relation.get("expected")
        if not isinstance(expected, dict) or not all(isinstance(expected.get(key), (int, float)) for key in ("left", "right")):
            errors.append(f"{path}.expected:must_have_numeric_left_right")
        elif relation.get("operator") == "equal" and abs(expected["left"] - expected["right"]) > 0.01:
            errors.append(f"{path}.expected:equal_relation_values_differ")


def check_variant_contracts(contract: dict[str, object], errors: list[str]) -> None:
    variants = contract.get("variant_contracts")
    schema_version = int(contract.get("schema_version", 1) or 1)
    if variants is None:
        if schema_version >= 3:
            errors.append("variant_contracts:required_for_schema_version_3")
        return
    if not isinstance(variants, list) or not variants:
        errors.append("variant_contracts:must_be_non_empty_array")
        return
    known_states = {
        item.get("source_state_id")
        for item in contract.get("states", [])
        if isinstance(item, dict) and item.get("source_state_id")
    }
    seen_variant_keys: set[str] = set()
    for index, variant in enumerate(variants):
        path = f"variant_contracts[{index}]"
        variant_key = variant.get("variant_key") if isinstance(variant, dict) else None
        if isinstance(variant_key, str) and variant_key:
            if variant_key in seen_variant_keys:
                errors.append(f"{path}.variant_key:must_be_unique")
            seen_variant_keys.add(variant_key)
        if not isinstance(variant, dict):
            errors.append(f"{path}:must_be_object")
            continue
        for key in VARIANT_CONTRACT_KEYS:
            if key not in variant:
                errors.append(f"{path}:missing:{key}")
        source_states = variant.get("source_state_ids")
        if not isinstance(source_states, list) or not source_states:
            errors.append(f"{path}.source_state_ids:must_be_non_empty_array")
        elif any(state_id not in known_states for state_id in source_states):
            errors.append(f"{path}.source_state_ids:must_reference_states")
        visible = variant.get("visible_elements")
        visible_ids: set[str] = set()
        if not isinstance(visible, list) or not visible:
            errors.append(f"{path}.visible_elements:must_be_non_empty_array")
        else:
            for element_index, element in enumerate(visible):
                element_path = f"{path}.visible_elements[{element_index}]"
                if not isinstance(element, dict):
                    errors.append(f"{element_path}:must_be_object")
                    continue
                for key in ("id", "owner", "display_mode"):
                    if key not in element or not element.get(key):
                        errors.append(f"{element_path}:missing:{key}")
                if isinstance(element.get("id"), str) and element.get("id"):
                    visible_ids.add(element["id"])
        forbidden = variant.get("forbidden_elements")
        if not isinstance(forbidden, list):
            errors.append(f"{path}.forbidden_elements:must_be_array")
        else:
            for element_index, element in enumerate(forbidden):
                if not isinstance(element, (str, dict)) or (isinstance(element, str) and not element.strip()):
                    errors.append(f"{path}.forbidden_elements[{element_index}]:must_be_non_empty_string_or_object")
        line_groups = variant.get("line_groups")
        if not isinstance(line_groups, list):
            errors.append(f"{path}.line_groups:must_be_array")
        else:
            for group_index, group in enumerate(line_groups):
                group_path = f"{path}.line_groups[{group_index}]"
                if not isinstance(group, dict) or not isinstance(group.get("members"), list) or not group.get("members"):
                    errors.append(f"{group_path}:must_have_members")
                elif any(member not in visible_ids for member in group["members"]):
                    errors.append(f"{group_path}.members:must_reference_visible_elements")
        if not isinstance(variant.get("component_ownership"), dict):
            errors.append(f"{path}.component_ownership:must_be_object")


def check_capture_readiness(contract: dict[str, object], errors: list[str]) -> None:
    readiness = contract.get("capture_readiness")
    schema_version = int(contract.get("schema_version", 1) or 1)
    if readiness is None:
        if schema_version >= 3:
            errors.append("capture_readiness:required_for_schema_version_3")
        return
    if not isinstance(readiness, dict):
        errors.append("capture_readiness:must_be_object")
        return
    for key in READINESS_KEYS:
        if key not in readiness:
            errors.append(f"capture_readiness:missing:{key}")
    allowed = {
        "capture_integrity": {"passed", "blocked", "invalid"},
        "capture_completeness": {"passed", "incomplete", "blocked"},
        "implementation_readiness": {"ready", "design_incomplete", "blocked", "not-run"},
        "readiness_scope": {"feature", "variant"},
    }
    for key, values in allowed.items():
        if readiness.get(key) not in values:
            errors.append(f"capture_readiness.{key}:unsupported_value")
    if not isinstance(readiness.get("target_variant_keys"), list) or not readiness.get("target_variant_keys"):
        errors.append("capture_readiness.target_variant_keys:must_be_non_empty_array")
    if not isinstance(readiness.get("blockers"), list):
        errors.append("capture_readiness.blockers:must_be_array")
    if not isinstance(readiness.get("evidence"), str) or not readiness.get("evidence"):
        errors.append("capture_readiness.evidence:must_be_non_empty_path")
    if readiness.get("implementation_readiness") == "ready":
        if readiness.get("capture_integrity") != "passed":
            errors.append("capture_readiness:ready_requires_passed_capture_integrity")
        if readiness.get("capture_completeness") != "passed" and readiness.get("readiness_scope") != "variant":
            errors.append("capture_readiness:incomplete_feature_cannot_be_feature_ready")


def check_spatial_constraints(contract: dict[str, object], errors: list[str]) -> None:
    if int(contract.get("schema_version", 1) or 1) < 2:
        return
    constraints = contract.get("container_constraints")
    if not isinstance(constraints, list) or not constraints:
        errors.append("container_constraints:must_be_non_empty_array_for_schema_v2")
        constraints = []
    for index, item in enumerate(constraints):
        path = f"container_constraints[{index}]"
        if not isinstance(item, dict):
            errors.append(f"{path}:must_be_object")
            continue
        for key in CONTAINER_CONSTRAINT_KEYS:
            if key not in item:
                errors.append(f"{path}:missing:{key}")
        for anchor in ("container", "first_visible_child", "terminal_visible_child"):
            value = item.get(anchor)
            if not isinstance(value, dict):
                errors.append(f"{path}.{anchor}:must_be_object")
            else:
                check_bbox(value.get("bbox"), f"{path}.{anchor}.bbox", errors)
        edge_insets = item.get("edge_insets")
        if not isinstance(edge_insets, dict) or not all(isinstance(edge_insets.get(edge), (int, float)) for edge in ("top", "right", "bottom", "left")):
            errors.append(f"{path}.edge_insets:must_have_numeric_edges")
        if not isinstance(item.get("evidence"), str) or not item.get("evidence"):
            errors.append(f"{path}.evidence:must_be_non_empty_path")

    invariants = contract.get("variant_invariants")
    if not isinstance(invariants, list):
        errors.append("variant_invariants:must_be_array")
        invariants = []
    for index, item in enumerate(invariants):
        path = f"variant_invariants[{index}]"
        if not isinstance(item, dict):
            errors.append(f"{path}:must_be_object")
            continue
        for key in VARIANT_INVARIANT_KEYS:
            if key not in item:
                errors.append(f"{path}:missing:{key}")
        if not isinstance(item.get("source_state_ids"), list) or len(item.get("source_state_ids", [])) < 2:
            errors.append(f"{path}.source_state_ids:must_cover_multiple_states")
        if not isinstance(item.get("measurements"), dict) or len(item.get("measurements", {})) < 2:
            errors.append(f"{path}.measurements:must_cover_multiple_states")
        if not isinstance(item.get("expected"), (int, float)) or not isinstance(item.get("tolerance"), (int, float)):
            errors.append(f"{path}:expected_and_tolerance_must_be_numeric")
        if item.get("invariant_across_variants") is not True:
            errors.append(f"{path}.invariant_across_variants:must_be_true")

    coverage = contract.get("spatial_constraint_coverage")
    if not isinstance(coverage, dict):
        errors.append("spatial_constraint_coverage:must_be_object")
    else:
        for key in SPATIAL_COVERAGE_ARRAYS:
            if coverage.get(key) != []:
                errors.append(f"spatial_constraint_coverage:{key}:must_be_empty")
        candidates = coverage.get("candidate_containers")
        completed = coverage.get("containers_with_terminal")
        if not isinstance(candidates, int) or not isinstance(completed, int) or candidates != completed:
            errors.append("spatial_constraint_coverage:all_candidate_containers_require_terminal_anchor")
        if not isinstance(coverage.get("states_with_constraints"), list) or not coverage.get("states_with_constraints"):
            errors.append("spatial_constraint_coverage:states_with_constraints:must_be_non_empty_array")


def compare_spatial_constraints(target: dict[str, object], rendered: dict[str, object]) -> list[str]:
    errors: list[str] = []
    target_constraints = {
        (item.get("source_state_id"), item.get("component_id")): item
        for item in target.get("container_constraints", []) if isinstance(item, dict)
    }
    rendered_constraints = {
        (item.get("source_state_id"), item.get("component_id")): item
        for item in rendered.get("container_constraints", []) if isinstance(item, dict)
    }
    for key, expected_item in target_constraints.items():
        actual_item = rendered_constraints.get(key)
        if not actual_item:
            errors.append(f"missing_rendered_container_constraint:{key[0]}:{key[1]}")
            continue
        tolerance = float(expected_item.get("tolerance", 1))
        for edge in ("top", "right", "bottom", "left"):
            expected = expected_item.get("edge_insets", {}).get(edge)
            actual = actual_item.get("edge_insets", {}).get(edge)
            if not isinstance(expected, (int, float)) or not isinstance(actual, (int, float)) or abs(expected - actual) > tolerance:
                errors.append(f"rendered_spatial_mismatch:{key[0]}:{key[1]}:{edge}")

    rendered_invariants = [
        item for item in rendered.get("variant_invariants", [])
        if isinstance(item, dict) and item.get("id")
    ]
    expected_invariants = [
        item for item in target.get("variant_invariants", [])
        if isinstance(item, dict) and item.get("id")
    ]
    for index, expected_item in enumerate(expected_invariants):
        actual_item = rendered_invariants[index] if index < len(rendered_invariants) else None
        if not actual_item:
            errors.append(f"missing_rendered_variant_invariant:{expected_item['id']}")
            continue
        expected = expected_item.get("expected")
        actual = actual_item.get("actual", actual_item.get("expected"))
        tolerance = expected_item.get("tolerance", 1)
        if not isinstance(expected, (int, float)) or not isinstance(actual, (int, float)) or abs(expected - actual) > tolerance:
            errors.append(f"rendered_variant_invariant_mismatch:{expected_item['id']}[{index}]")
    return errors


def check_interaction_contracts(contract: dict[str, object], errors: list[str]) -> None:
    interactions = contract.get("interaction_contracts")
    if not isinstance(interactions, list):
        errors.append("interaction_contracts:must_be_array")
        return
    for index, item in enumerate(interactions):
        path = f"interaction_contracts[{index}]"
        if not isinstance(item, dict):
            errors.append(f"{path}:must_be_object")
            continue
        for key in INTERACTION_KEYS:
            if key not in item:
                errors.append(f"{path}:missing:{key}")
        states = item.get("states")
        if item.get("resizable") == "vertical":
            if not isinstance(states, dict):
                errors.append(f"{path}.states:must_be_object_for_vertical_resize")
                continue
            for state_name in ("default", "dragging", "after-drag"):
                state = states.get(state_name)
                if not isinstance(state, dict):
                    errors.append(f"{path}.states:missing:{state_name}")
                    continue
                if not isinstance(state.get("evidence"), str) or not state.get("evidence"):
                    errors.append(f"{path}.states.{state_name}.evidence:must_be_non_empty_path")
                check_bbox(state.get("bbox"), f"{path}.states.{state_name}.bbox", errors)
            default = states.get("default", {})
            after = states.get("after-drag", {})
            evidence_status = item.get("status")
            if isinstance(after, dict) and after.get("status"):
                evidence_status = after["status"]
            if evidence_status in {"blocked", "not_observed"}:
                continue
            if isinstance(default, dict) and isinstance(after, dict) and isinstance(default.get("bbox"), dict) and isinstance(after.get("bbox"), dict):
                default_height = default["bbox"].get("height")
                after_height = after["bbox"].get("height")
                if isinstance(default_height, (int, float)) and isinstance(after_height, (int, float)) and after_height <= default_height:
                    errors.append(f"{path}.states.after-drag.bbox.height:must_exceed_default_for_vertical_resize")


def exact_contract_errors(contract: dict[str, object]) -> list[str]:
    errors: list[str] = []
    states = contract.get("states", [])
    components = contract.get("components", [])
    if not isinstance(states, list):
        return ["states must be an array"]
    if not isinstance(components, list):
        return ["components must be an array"]
    check_layout_relations(contract, errors)
    check_variant_contracts(contract, errors)
    check_capture_readiness(contract, errors)
    check_spatial_constraints(contract, errors)
    check_interaction_contracts(contract, errors)
    check_compound_controls(contract, errors)

    def reject_summary(value: object, path: str) -> None:
        if isinstance(value, str) and value.strip() in SUMMARY_VALUES:
            errors.append(f"summary_value_not_exact:{path}:{value}")
        elif isinstance(value, dict):
            for key, child in value.items():
                reject_summary(child, f"{path}.{key}")
        elif isinstance(value, list):
            for index, child in enumerate(value):
                reject_summary(child, f"{path}[{index}]")

    required_state_keys = ("source_state_id", "session", "url", "viewport", "artifacts", "components", "fields", "visual_elements", "geometry", "styles", "interactions", "svg")
    required_artifacts = ("before_html", "after_html", "layout", "computed", "target_contract", "interaction_evidence", "screenshot")
    for index, state in enumerate(states):
        prefix = f"states[{index}]"
        if not isinstance(state, dict):
            errors.append(f"{prefix}:must_be_object")
            continue
        for key in required_state_keys:
            if key not in state:
                errors.append(f"{prefix}:missing:{key}")
        viewport = state.get("viewport")
        if not isinstance(viewport, dict) or not all(isinstance(viewport.get(key), (int, float)) for key in ("width", "height", "dpr")):
            errors.append(f"{prefix}.viewport:must_have_numeric_width_height_dpr")
        artifacts = state.get("artifacts")
        if not isinstance(artifacts, dict):
            errors.append(f"{prefix}.artifacts:must_be_object")
        else:
            for key in required_artifacts:
                if not isinstance(artifacts.get(key), str) or not artifacts.get(key):
                    errors.append(f"{prefix}.artifacts.{key}:must_be_non_empty_path")
        if not isinstance(state.get("geometry"), dict) or not state.get("geometry"):
            errors.append(f"{prefix}.geometry:must_be_non_empty_object")
        if not isinstance(state.get("styles"), dict) or not state.get("styles"):
            errors.append(f"{prefix}.styles:must_be_non_empty_object")
        if not isinstance(state.get("fields"), list):
            errors.append(f"{prefix}.fields:must_be_array")
        if not isinstance(state.get("visual_elements"), list) or not state.get("visual_elements"):
            errors.append(f"{prefix}.visual_elements:must_be_non_empty_array")
        else:
            for visual_index, visual in enumerate(state["visual_elements"]):
                visual_path = f"{prefix}.visual_elements[{visual_index}]"
                check_visual_element(visual, visual_path, errors)
        if not isinstance(state.get("interactions"), list):
            errors.append(f"{prefix}.interactions:must_be_array")
        if not isinstance(state.get("svg"), list):
            errors.append(f"{prefix}.svg:must_be_array")
        check_bbox(state.get("geometry", {}).get("bbox") if isinstance(state.get("geometry"), dict) else None, f"{prefix}.geometry.bbox", errors)
        check_styles(state.get("styles"), f"{prefix}.styles", errors)
        reject_summary(state.get("geometry"), f"{prefix}.geometry")
        reject_summary(state.get("styles"), f"{prefix}.styles")

        for field_index, field in enumerate(state.get("fields", [])):
            if not isinstance(field, dict):
                errors.append(f"{prefix}.fields[{field_index}]:must_be_object_with_id_label_control")
                continue
            for key in ("id", "label", "control", "placeholder", "required", "order"):
                if key not in field:
                    errors.append(f"{prefix}.fields[{field_index}]:missing:{key}")
        for interaction_index, interaction in enumerate(state.get("interactions", [])):
            if not isinstance(interaction, dict):
                errors.append(f"{prefix}.interactions[{interaction_index}]:must_be_object_with_kind_phases")
                continue
            for key in ("kind", "target", "phases", "before", "after"):
                if key not in interaction:
                    errors.append(f"{prefix}.interactions[{interaction_index}]:missing:{key}")
        for svg_index, svg in enumerate(state.get("svg", [])):
            check_svg(svg, f"{prefix}.svg[{svg_index}]", errors)
            reject_summary(svg, f"{prefix}.svg[{svg_index}]")

    for index, component in enumerate(components):
        prefix = f"components[{index}]"
        if not isinstance(component, dict):
            errors.append(f"{prefix}:must_be_object")
            continue
        for key in ("component_id", "source_state_ids", "props", "events", "state_matrix", "geometry", "styles", "svg"):
            if key not in component:
                errors.append(f"{prefix}:missing:{key}")
        if not isinstance(component.get("source_state_ids"), list):
            errors.append(f"{prefix}.source_state_ids:must_be_array")
        check_bbox(component.get("geometry", {}).get("bbox") if isinstance(component.get("geometry"), dict) else None, f"{prefix}.geometry.bbox", errors)
        check_styles(component.get("styles"), f"{prefix}.styles", errors)
        if not isinstance(component.get("svg"), list):
            errors.append(f"{prefix}.svg:must_be_array")
        for svg_index, svg in enumerate(component.get("svg", [])):
            check_svg(svg, f"{prefix}.svg[{svg_index}]", errors)
        reject_summary(component.get("geometry"), f"{prefix}.geometry")
        reject_summary(component.get("styles"), f"{prefix}.styles")

    return errors


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def status_map(text: str) -> dict[str, str]:
    return {key: value for key, value in STATUS_RE.findall(text)}


def task_states(text: str) -> dict[str, bool]:
    return {task: mark.lower() == "x" for mark, task in TASK_RE.findall(text)}


def add(errors: list[str], warnings: list[str], level: str, message: str) -> None:
    (errors if level == "error" else warnings).append(message)


def apply_task_waivers(feature_dir: Path, task_id: str | None, errors: list[str], warnings: list[str]) -> dict[str, object]:
    waiver_path = feature_dir / WAIVER_FILENAME
    result: dict[str, object] = {"file": str(waiver_path), "exists": waiver_path.is_file(), "applied": []}
    if not waiver_path.is_file():
        return result
    try:
        payload = json.loads(read(waiver_path))
    except (OSError, json.JSONDecodeError) as exc:
        errors.append(f"invalid_waiver_file:{exc}")
        return result
    if not isinstance(payload, dict) or payload.get("schema_version") != 1 or not isinstance(payload.get("waivers"), list):
        errors.append("invalid_waiver_file:expected_schema_version_1_and_waivers_array")
        return result
    for index, waiver in enumerate(payload["waivers"]):
        path = f"waivers[{index}]"
        required = ("id", "task_id", "approved_by", "approved_at", "reason", "allowed_errors", "scope", "active")
        if not isinstance(waiver, dict) or any(key not in waiver for key in required):
            errors.append(f"invalid_waiver_file:{path}:missing_required_fields")
            continue
        allowed = waiver.get("allowed_errors")
        scope = waiver.get("scope")
        if not isinstance(allowed, list) or not allowed or not all(isinstance(item, str) and item for item in allowed):
            errors.append(f"invalid_waiver_file:{path}.allowed_errors:must_be_non_empty_string_array")
            continue
        if not isinstance(scope, list) or not scope or not all(isinstance(item, str) and item for item in scope):
            errors.append(f"invalid_waiver_file:{path}.scope:must_be_non_empty_string_array")
            continue
        if waiver.get("active") is not True or waiver.get("task_id") != task_id:
            continue
        matched = [error for error in list(errors) if error in allowed]
        for error in matched:
            errors.remove(error)
            warnings.append(f"waived_error:{waiver['id']}:{error}")
        result["applied"].append({
            "id": waiver["id"],
            "task_id": waiver["task_id"],
            "approved_by": waiver["approved_by"],
            "approved_at": waiver["approved_at"],
            "reason": waiver["reason"],
            "scope": scope,
            "matched_errors": matched,
            "unused_allowed_errors": [error for error in allowed if error not in matched],
        })
    return result


def task_block(text: str, task_id: str | None) -> str:
    if not task_id:
        return text
    match = re.search(rf"^- \[[ xX]\] {re.escape(task_id)}\b(?P<body>.*?)(?=^## |\Z)", text, re.MULTILINE | re.DOTALL)
    return match.group(0) if match else ""


def task_dependencies(text: str, task_id: str) -> list[str] | None:
    block = task_block(text, task_id)
    if not block:
        return None
    match = re.search(r"^\s+- 前置条件：(?P<deps>.*?)$", block, re.MULTILINE)
    if not match:
        return None
    prefix = task_id.rsplit("-T", 1)[0]
    references = re.findall(r"(?:PM-[A-Z0-9]+-)?T\d+", match.group("deps"))
    return sorted({reference if reference.startswith("PM-") else f"{prefix}-{reference}" for reference in references})


def scoped_source_files(source_dir: Path, task_text: str) -> list[Path]:
    names = set(re.findall(r"[A-Za-z][A-Za-z0-9_-]*\.vue", task_text))
    paths: list[Path] = []
    for path in source_dir.rglob("*.vue"):
        if path.name in names:
            paths.append(path)
    return paths


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("feature_dir", type=Path)
    parser.add_argument("--task-id", help="Check only this atomic task and its prerequisites")
    parser.add_argument("--source-dir", type=Path, help="Frontend source directory for scoped forbidden-pattern checks")
    parser.add_argument("--compare-contract", type=Path, help="Rendered implementation contract to compare against extracted target contract")
    parser.add_argument("--phase", choices=("capture", "design", "implementation", "acceptance"), help="Run phase-specific readiness checks")
    parser.add_argument("--json", action="store_true", dest="as_json")
    args = parser.parse_args()

    feature_dir = args.feature_dir.resolve()
    errors: list[str] = []
    warnings: list[str] = []
    result: dict[str, object] = {
        "feature_dir": str(feature_dir),
        "task_id": args.task_id,
        "phase": args.phase,
        "required_files": {},
        "statuses": {},
        "tasks": {},
        "source_state_check": {},
        "forbidden_pattern_check": {},
        "errors": errors,
        "warnings": warnings,
    }

    texts: dict[str, str] = {}
    for filename in REQUIRED_FILES:
        path = feature_dir / filename
        exists = path.is_file()
        result["required_files"][filename] = exists
        if not exists:
            add(errors, warnings, "error", f"missing_required_file:{filename}")
        else:
            texts[filename] = read(path)

    atomic_text = texts.get("atomic-tasks.md", "")
    tasks = task_states(atomic_text)
    result["tasks"] = tasks
    if args.task_id:
        if args.task_id not in tasks:
            add(errors, warnings, "error", f"task_not_found:{args.task_id}")
        else:
            dependencies = task_dependencies(atomic_text, args.task_id)
            result["task_dependencies"] = dependencies
            if dependencies is None:
                if args.task_id.endswith("-T00"):
                    dependencies = []
                    result["task_dependencies"] = dependencies
                else:
                    add(errors, warnings, "error", f"task_prerequisites_unspecified:{args.task_id}")
            if dependencies is not None:
                for dependency in dependencies:
                    if dependency not in tasks:
                        add(errors, warnings, "error", f"unknown_task_prerequisite:{dependency}")
                    elif not tasks[dependency]:
                        add(errors, warnings, "error", f"unchecked_prerequisite:{dependency}")

    status_values: dict[str, set[str]] = {}
    for filename, text in texts.items():
        for key, value in status_map(text).items():
            status_values.setdefault(key, set()).add(value)
    result["statuses"] = {key: sorted(values) for key, values in status_values.items()}
    for key, values in status_values.items():
        if len(values) > 1:
            add(errors, warnings, "error", f"status_conflict:{key}:{','.join(sorted(values))}")

    model_states = sorted(set(STATE_RE.findall(texts.get("component-model.md", ""))))
    manifest_text = texts.get("capture-manifest.md", "")
    missing_states = [state for state in model_states if state not in manifest_text]
    result["source_state_check"] = {
        "model_state_count": len(model_states),
        "missing_in_manifest": missing_states,
    }
    for state in missing_states:
        add(errors, warnings, "error", f"source_state_not_in_manifest:{state}")

    extraction = {}
    extraction_path = feature_dir / "extracted-ui-contract.json"
    if extraction_path.is_file():
        try:
            extraction = json.loads(read(extraction_path))
            if not isinstance(extraction, dict):
                raise ValueError("top-level must be an object")
        except (json.JSONDecodeError, OSError, ValueError) as exc:
            add(errors, warnings, "error", f"invalid_extracted_ui_contract:{exc}")
            extraction = {}

    for contract_error in exact_contract_errors(extraction):
        add(errors, warnings, "error", f"invalid_extracted_ui_contract:{contract_error}")
    if extraction and int(extraction.get("schema_version", 1) or 1) < 2:
        add(errors, warnings, "warning", "legacy_contract_without_spatial_constraint_coverage:schema_version<2")

    if args.phase in {"implementation", "acceptance"}:
        readiness = extraction.get("capture_readiness") if isinstance(extraction, dict) else None
        if not isinstance(readiness, dict) or readiness.get("implementation_readiness") != "ready":
            add(errors, warnings, "error", f"phase_requires_implementation_ready:{args.phase}")
    if args.phase == "acceptance" and not args.compare_contract:
        add(errors, warnings, "error", "acceptance_requires_compare_contract")

    textarea_fields = {
        field.get("id")
        for state in extraction.get("states", [])
        if isinstance(state, dict)
        for field in state.get("fields", [])
        if isinstance(field, dict) and field.get("control") == "textarea" and field.get("id")
    }
    interaction_contracts = extraction.get("interaction_contracts", [])
    covered_resizable = {
        item.get("control")
        for item in interaction_contracts
        if isinstance(item, dict) and item.get("resizable") == "vertical"
    }
    for field_id in sorted(textarea_fields - covered_resizable):
        add(errors, warnings, "error", f"textarea_missing_vertical_resize_contract:{field_id}")

    extracted_states = {
        item.get("source_state_id")
        for item in extraction.get("states", [])
        if isinstance(item, dict) and item.get("source_state_id")
    }
    extracted_state_errors: list[str] = []
    required_state_keys = ("source_state_id", "session", "url", "viewport", "artifacts", "components", "fields", "visual_elements", "geometry", "styles", "interactions", "svg")
    required_artifacts = ("before_html", "after_html", "layout", "computed", "target_contract", "interaction_evidence", "screenshot")
    for index, item in enumerate(extraction.get("states", [])):
        if not isinstance(item, dict):
            extracted_state_errors.append(f"state[{index}] must be an object")
            continue
        for key in required_state_keys:
            if key not in item:
                extracted_state_errors.append(f"state[{index}] missing:{key}")
        artifacts = item.get("artifacts", {})
        if isinstance(artifacts, dict):
            for key in required_artifacts:
                if key not in artifacts:
                    extracted_state_errors.append(f"state[{index}] artifacts missing:{key}")
        else:
            extracted_state_errors.append(f"state[{index}] artifacts must be an object")
    for index, item in enumerate(extraction.get("components", [])):
        if not isinstance(item, dict):
            extracted_state_errors.append(f"component[{index}] must be an object")
            continue
        for key in ("component_id", "source_state_ids", "props", "events", "state_matrix", "geometry", "styles", "svg"):
            if key not in item:
                extracted_state_errors.append(f"component[{index}] missing:{key}")
    for error in extracted_state_errors:
        add(errors, warnings, "error", f"invalid_extracted_ui_contract:{error}")
    contract_missing_states = [state for state in model_states if state not in extracted_states] if extraction else []
    coverage_keys = [
        "unmapped_source_states",
        "unmapped_components",
        "unmapped_fields",
        "unmapped_visual_properties",
        "unmapped_interactions",
        "cross_document_conflicts",
    ]
    if int(extraction.get("schema_version", 1) or 1) >= 2:
        coverage_keys.append("unmapped_spatial_constraints")
    coverage = extraction.get("coverage", {}) if extraction else {key: [] for key in coverage_keys}
    result["extraction_check"] = {
        "file": str(extraction_path),
        "extracted_state_count": len(extracted_states),
        "missing_in_contract": contract_missing_states,
        "coverage": {key: coverage.get(key, "missing") for key in coverage_keys},
    }
    for state in contract_missing_states:
        add(errors, warnings, "error", f"source_state_not_in_extracted_contract:{state}")
    for key in coverage_keys:
        value = coverage.get(key)
        if value != []:
            add(errors, warnings, "error", f"extraction_unresolved:{key}")

    if args.compare_contract:
        compare_path = args.compare_contract.resolve()
        compare_errors: list[str] = []
        try:
            rendered = json.loads(read(compare_path))
            target_by_state = {item.get("source_state_id"): item for item in extraction.get("states", []) if isinstance(item, dict)}
            rendered_by_state = {item.get("source_state_id"): item for item in rendered.get("states", []) if isinstance(item, dict)}
            if rendered.get("layout_relations") != extraction.get("layout_relations"):
                compare_errors.append("rendered_contract_mismatch:layout_relations")
            if rendered.get("variant_contracts") != extraction.get("variant_contracts"):
                compare_errors.append("rendered_contract_mismatch:variant_contracts")
            if rendered.get("interaction_contracts") != extraction.get("interaction_contracts"):
                compare_errors.append("rendered_contract_mismatch:interaction_contracts")
            if rendered.get("compound_controls") != extraction.get("compound_controls"):
                compare_errors.append("rendered_contract_mismatch:compound_controls")
            compare_errors.extend(compare_spatial_constraints(extraction, rendered))
            for state_id in sorted(set(target_by_state) | set(rendered_by_state)):
                if state_id not in target_by_state:
                    compare_errors.append(f"unexpected_rendered_state:{state_id}")
                elif state_id not in rendered_by_state:
                    compare_errors.append(f"missing_rendered_state:{state_id}")
                else:
                    for key in ("geometry", "styles", "svg"):
                        if target_by_state[state_id].get(key) != rendered_by_state[state_id].get(key):
                            compare_errors.append(f"rendered_contract_mismatch:{state_id}:{key}")
        except (OSError, json.JSONDecodeError, AttributeError) as exc:
            compare_errors.append(f"invalid_compare_contract:{exc}")
        result["implementation_compare"] = {"file": str(compare_path), "errors": compare_errors}
        for compare_error in compare_errors:
            add(errors, warnings, "error", compare_error)

    task_text = task_block(atomic_text, args.task_id)
    source_files = scoped_source_files(args.source_dir.resolve(), task_text) if args.source_dir else []
    forbidden: list[dict[str, str]] = []
    for path in source_files:
        text = path.read_text(encoding="utf-8", errors="ignore")
        patterns = (
            (r"min-height\s*:\s*768px", "fixed_768_min_height"),
            (r"max-height\s*[:=]\s*[\"']?600", "fixed_600_max_height"),
        )
        if path.name in {"PageHeader.vue", "FullScreenModal.vue"}:
            patterns += ((r"min-width\s*:\s*1200px|min-width\s*:\s*1300px", "shared_template_min_width"),)
        for pattern, name in patterns:
            if re.search(pattern, text, re.IGNORECASE):
                forbidden.append({"file": str(path), "pattern": name})
                add(errors, warnings, "error", f"forbidden_source_pattern:{name}:{path}")
    result["forbidden_pattern_check"] = {
        "scoped_files": [str(path) for path in source_files],
        "matches": forbidden,
    }

    if not args.task_id:
        add(errors, warnings, "warning", "use_task_id_for_prerequisite-aware_check")

    result["waiver_check"] = apply_task_waivers(feature_dir, args.task_id, errors, warnings)
    result["passed"] = not errors
    output = json.dumps(result, ensure_ascii=False, indent=2)
    print(output)
    if not args.as_json:
        print("PASS" if not errors else "BLOCKED")
    return 0 if not errors else 1


if __name__ == "__main__":
    sys.exit(main())
