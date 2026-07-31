import pytest
from fastapi import HTTPException

from app.ucp.action_contract import (
    ActionContractError,
    build_field_catalog,
    evaluate_condition_ast,
    redact_sample,
    resolve_business_error,
    validate_condition_ast,
    validate_mapping,
    validate_schema,
)
from app.ucp.pipeline_engine import PipelineContext, _execute_transform_step, _is_dry_run_side_effect
from app.ucp.routers.capabilities import _safe_path


def test_schema_catalog_and_sample_are_allowlisted():
    schema = {"properties": {"employee_name": {"type": "string", "title": "员工姓名"}, "id_card": {"type": "string", "sensitive": True}}}
    validate_schema(schema, label="输出")
    catalog = build_field_catalog(schema)
    assert redact_sample({"employee_name": "张三", "id_card": "110101"}, catalog) == {"employee_name": "张三"}
    assert redact_sample({"unknown": "forbidden"}, catalog) == {}


def test_mapping_rejects_incompatible_or_unknown_fields():
    source = build_field_catalog({"properties": {"name": {"type": "string"}}})
    target = build_field_catalog({"properties": {"employee_name": {"type": "string"}}})
    mapping = {"version": 1, "rules": [{"source_kind": "upstream_field", "source_field_id": "name", "target_field_id": "employee_name"}]}
    assert validate_mapping(mapping, source_catalog=source, target_catalog=target) == mapping
    with pytest.raises(ActionContractError):
        validate_mapping({"version": 1, "rules": [{"source_kind": "upstream_field", "source_field_id": "missing", "target_field_id": "employee_name"}]}, source_catalog=source, target_catalog=target)


def test_condition_is_structured_and_fails_closed():
    catalog = build_field_catalog({"properties": {"age": {"type": "integer"}}})
    condition = {"version": 1, "mode": "ALL", "rules": [{"left_field_id": "age", "operator": "GTE", "right": 18}]}
    assert validate_condition_ast(condition, catalog=catalog) == condition
    assert evaluate_condition_ast(condition, values={"age": 20}, catalog=catalog)
    assert not evaluate_condition_ast(condition, values={"age": "20"}, catalog=catalog)


def test_error_rules_use_priority_then_safe_chinese_defaults():
    rules = [
        {"status_code": 404, "message": "低优先级提示", "priority": 1},
        {"status_code": 404, "error_code": "NOT_FOUND", "message": "未找到候选人", "priority": 10},
    ]
    assert resolve_business_error(rules, status_code=404, error_code="NOT_FOUND", fallback="fallback") == "未找到候选人"
    assert resolve_business_error([], status_code=401, error_code=None, fallback="fallback") == "授权已失效，请更新系统凭证后重试"


@pytest.mark.parametrize("path", ["", "open-apis/contact/v3/users", "https://open.feishu.cn/open-apis/contact/v3/users", "//open.feishu.cn/users", "/../users"])
def test_manual_action_requires_a_safe_relative_path(path):
    with pytest.raises(HTTPException, match="安全的相对路径"):
        _safe_path(path)


def test_manual_action_accepts_a_safe_relative_path():
    assert _safe_path("/open-apis/contact/v3/users") == "/open-apis/contact/v3/users"


@pytest.mark.asyncio
async def test_transform_supports_explicit_mapping_and_same_name_passthrough():
    context = PipelineContext("trace", "run")
    context.set("source", {"data": [{"employee_number": "106401", "employee_name": "吴天昊", "english_name": "tianhao.wu", "ignored": "secret"}]})
    result = await _execute_transform_step(
        {
            "mapping": {
                "version": 1,
                "mode": "mapped_plus_same_name",
                "rules": [{"source_field_id": "employee_number", "target_field_id": "employee_id", "source_kind": "upstream_field"}],
                "target_field_catalog": [{"field_id": "employee_id"}, {"field_id": "employee_name"}, {"field_id": "english_name"}],
            },
            "_incoming_edges": [{"from": "source"}],
        },
        context,
        None,
    )
    assert result["data"] == [{"employee_id": "106401", "employee_name": "吴天昊", "english_name": "tianhao.wu"}]


@pytest.mark.asyncio
async def test_transform_rejects_unsupported_mode():
    context = PipelineContext("trace", "run")
    context.set("source", {"data": [{"name": "张三"}]})
    with pytest.raises(RuntimeError, match="mode"):
        await _execute_transform_step(
            {"mapping": {"version": 1, "mode": "anything", "rules": []}, "_incoming_edges": [{"from": "source"}]},
            context,
            None,
        )


@pytest.mark.asyncio
async def test_transform_executes_only_versioned_mapping_dto():
    context = PipelineContext("trace", "run")
    context.set("source", {"data": [{"name": "张三"}]})
    result = await _execute_transform_step(
        {"mapping": {"version": 1, "rules": [{"source_field_id": "name", "target_field_id": "employee_name"}]}, "_incoming_edges": [{"from": "source"}]},
        context,
        None,
    )
    assert result["data"] == [{"employee_name": "张三"}]
    with pytest.raises(RuntimeError, match="version=1"):
        await _execute_transform_step({"mapping": {"rules": []}, "_incoming_edges": [{"from": "source"}]}, context, None)


@pytest.mark.parametrize("node_type", ["NOTIFY", "APPROVAL", "WAIT", "WAREHOUSE_ASSET_SINK"])
def test_dry_run_marks_every_side_effect_node_for_safe_skip(node_type):
    assert _is_dry_run_side_effect({"type": node_type})
    assert not _is_dry_run_side_effect({"type": "TRANSFORM"})
