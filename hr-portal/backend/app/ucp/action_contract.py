"""Validated contracts for catalog read actions and pipeline configuration."""
from __future__ import annotations

import hashlib
import json
from typing import Any


class ActionContractError(ValueError):
    pass


SCALAR_TYPES = {"string", "number", "integer", "boolean", "date"}
OPERATORS = {"EQ", "NE", "CONTAINS", "GT", "GTE", "LT", "LTE", "IS_EMPTY", "NOT_EMPTY"}


def resolve_business_error(error_rules: list[dict[str, Any]], *, status_code: int | None, error_code: str | None, fallback: str) -> str:
    """Select the most specific configured business error without exposing raw details."""
    candidates = [rule for rule in error_rules if isinstance(rule, dict)]
    candidates.sort(key=lambda rule: int(rule.get("priority", 0)), reverse=True)
    for rule in candidates:
        matches_status = rule.get("status_code") in (None, status_code)
        matches_code = rule.get("error_code") in (None, error_code)
        if matches_status and matches_code and str(rule.get("message") or "").strip():
            return str(rule["message"]).strip()
    defaults = {401: "授权已失效，请更新系统凭证后重试", 403: "当前凭证无权访问该业务数据", 404: "未找到符合条件的业务数据", 422: "请求字段不符合动作定义"}
    return defaults.get(status_code, fallback)


def schema_hash(input_schema: dict[str, Any], output_schema: dict[str, Any]) -> str:
    encoded = json.dumps({"input": input_schema, "output": output_schema}, sort_keys=True, separators=(",", ":"))
    return "sha256:" + hashlib.sha256(encoded.encode()).hexdigest()


def validate_schema(schema: dict[str, Any], *, label: str) -> dict[str, Any]:
    if not isinstance(schema, dict) or not isinstance(schema.get("properties", {}), dict):
        raise ActionContractError(f"{label} Schema 必须包含对象 properties")
    required = schema.get("required", [])
    if not isinstance(required, list) or set(required) - set(schema["properties"]):
        raise ActionContractError(f"{label} Schema 的必填字段无效")
    for field_id, definition in schema["properties"].items():
        if not isinstance(field_id, str) or not field_id or not isinstance(definition, dict) or definition.get("type", "string") not in SCALAR_TYPES | {"array", "object"}:
            raise ActionContractError("字段 Schema 包含不受支持的字段")
    return schema


def build_field_catalog(schema: dict[str, Any]) -> list[dict[str, Any]]:
    return [{"field_id": field_id, "label": str(definition.get("title") or field_id), "type": definition.get("type", "string"), "sensitive": bool(definition.get("sensitive", False)), "parent_field_id": None, "ordinal": index} for index, (field_id, definition) in enumerate(schema.get("properties", {}).items())]


def redact_sample(value: Any, catalog: list[dict[str, Any]]) -> dict[str, Any]:
    return {item["field_id"]: value[item["field_id"]] for item in catalog if not item.get("sensitive") and isinstance(value, dict) and item["field_id"] in value}


def validate_mapping(mapping: dict[str, Any], *, source_catalog: list[dict[str, Any]], target_catalog: list[dict[str, Any]]) -> dict[str, Any]:
    if not isinstance(mapping, dict) or mapping.get("version") != 1 or not isinstance(mapping.get("rules"), list):
        raise ActionContractError("字段映射必须使用 version=1 的受控结构")
    source, target = ({item["field_id"]: item for item in source_catalog}, {item["field_id"]: item for item in target_catalog})
    for rule in mapping["rules"]:
        source_id, target_id = rule.get("source_field_id"), rule.get("target_field_id")
        if rule.get("source_kind") != "upstream_field" or source_id not in source or target_id not in target or source[source_id]["type"] not in SCALAR_TYPES or target[target_id]["type"] not in SCALAR_TYPES or source[source_id]["type"] != target[target_id]["type"]:
            raise ActionContractError("映射只支持类型兼容的上游标量字段")
    return mapping


def validate_condition_ast(ast: dict[str, Any], *, catalog: list[dict[str, Any]]) -> dict[str, Any]:
    fields = {item["field_id"]: item for item in catalog}
    if not isinstance(ast, dict) or ast.get("version") != 1 or ast.get("mode") not in {"ALL", "ANY"} or not isinstance(ast.get("rules"), list):
        raise ActionContractError("条件必须使用 version=1 的 ALL 或 ANY 规则")
    for rule in ast["rules"]:
        if not isinstance(rule, dict) or rule.get("left_field_id") not in fields or rule.get("operator") not in OPERATORS:
            raise ActionContractError("条件字段或运算符不受支持")
        if fields[rule["left_field_id"]]["type"] == "object" or (fields[rule["left_field_id"]]["type"] == "array" and rule["operator"] != "CONTAINS"):
            raise ActionContractError("该字段类型不支持当前条件运算")
        if rule["operator"] not in {"IS_EMPTY", "NOT_EMPTY"} and "right" not in rule:
            raise ActionContractError("条件缺少比较值")
    return ast


def evaluate_condition_ast(ast: dict[str, Any], *, values: dict[str, Any], catalog: list[dict[str, Any]]) -> bool:
    try:
        validate_condition_ast(ast, catalog=catalog)
        outcomes = []
        for rule in ast["rules"]:
            left, operator, right = values.get(rule["left_field_id"]), rule["operator"], rule.get("right")
            if isinstance(right, dict): right = values.get(right.get("upstream_field_id"))
            if operator == "IS_EMPTY": outcomes.append(left in (None, "", [], {})); continue
            if operator == "NOT_EMPTY": outcomes.append(left not in (None, "", [], {})); continue
            if left is None or right is None: return False
            if operator == "CONTAINS": outcomes.append(isinstance(left, (str, list)) and right in left); continue
            outcomes.append({"EQ": left == right, "NE": left != right, "GT": left > right, "GTE": left >= right, "LT": left < right, "LTE": left <= right}[operator])
        return all(outcomes) if ast["mode"] == "ALL" else any(outcomes)
    except (ActionContractError, TypeError, ValueError):
        return False
