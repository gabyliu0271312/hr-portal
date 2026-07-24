from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from app.ucp.pipeline_engine import (
    PipelineContext,
    _execute_capability_lookup_step,
    _execute_record_merge_step,
    _execute_resource_step,
    _execute_warehouse_asset_sink_step,
)




def test_context_resolves_result_alias_for_direct_step_results():
    context = PipelineContext("trace-1", "run-1")
    records = [{"application_id": "app-1"}]
    context.set("read_pending", {"status": "success", "data": records})

    assert context.resolve_ref("${read_pending.result.data}") == records

@pytest.mark.asyncio
async def test_capability_lookup_records_each_item_and_keeps_missing_keys_retry_safe(monkeypatch):
    context = PipelineContext("trace-1", "run-1")
    context.set("read_pending", {"result": {"data": [{"application_id": "app-1", "name": "A"}, {"name": "B"}]}})
    db = SimpleNamespace(added=[], flush=AsyncMock())
    db.add = db.added.append

    async def execute_capability(_config, _db):
        return {"status": "success", "data": [{"salary_amount": 12000}], "error_code": None, "error_message": None}

    monkeypatch.setattr("app.ucp.pipeline_engine._execute_capability_step", execute_capability)
    result = await _execute_capability_lookup_step(
        {"input_key": "${read_pending.result.data}", "lookup_field": "application_id", "capability_id": 11},
        context,
        db,
        "trace-1",
        "run-1",
        "step-1",
    )

    assert result["status"] == "partial_success"
    assert result["success_count"] == 1
    assert result["failed_count"] == 1
    assert [item.status for item in db.added] == ["SUCCESS", "MISSING_KEY"]
    assert db.added[0].response_summary_masked["salary_amount"] == "[\u5df2\u8131\u654f]"


@pytest.mark.asyncio
async def test_record_merge_never_overwrites_source_values():
    context = PipelineContext("trace-1", "run-1")
    context.set("lookup", {"result": {"data": [{"salary_amount": 8000, "lookup_data": {"salary_amount": 12000, "salary_currency": "CNY"}}]}})

    result = await _execute_record_merge_step(
        {"input_key": "${lookup.result.data}", "field_mapping": [{"target": "salary_amount", "source": "salary_amount"}, {"target": "salary_currency", "source": "salary_currency"}]},
        context,
    )

    assert result["data"] == [{"salary_amount": 8000, "salary_currency": "CNY"}]


@pytest.mark.asyncio
async def test_asset_sink_receives_pipeline_batch_id(monkeypatch):
    context = PipelineContext("trace-1", "run-99")
    context.set("merged", {"result": {"data": [{"application_id": "app-1", "salary_amount": 12000}]}})
    received = {}

    class Sink:
        def __init__(self, _db):
            pass

        async def write(self, **kwargs):
            received.update(kwargs)
            return {"written_count": 1, **kwargs}

    monkeypatch.setattr("app.warehouse.asset_sink.WarehouseAssetSink", Sink)
    result = await _execute_warehouse_asset_sink_step(
        {"input_key": "${merged.result.data}", "target_asset": "pending_hires", "write_mode": "upsert", "primary_key": "application_id", "field_whitelist": ["application_id", "salary_amount"]},
        context,
        AsyncMock(),
        "run-99",
    )

    assert result["success_count"] == 1
    assert received["batch_id"] == "run-99"
    assert received["write_mode"] == "upsert"


@pytest.mark.asyncio
async def test_capability_lookup_keeps_duplicate_keys_traceable_and_no_offer_non_retryable(monkeypatch):
    context = PipelineContext("trace-1", "run-1")
    context.set("read_pending", {"result": {"data": [{"application_id": "same"}, {"application_id": "same"}, {"application_id": "missing"}]}})
    db = SimpleNamespace(added=[], flush=AsyncMock())
    db.add = db.added.append
    calls = []

    async def execute_capability(config, _db):
        calls.append(config["params"]["application_id"])
        if config["params"]["application_id"] == "missing":
            return {"status": "offer_not_found", "data": [], "error_code": None, "error_message": None}
        return {"status": "success", "data": [{"offer_id": "offer-1"}], "error_code": None, "error_message": None}

    monkeypatch.setattr("app.ucp.pipeline_engine._execute_capability_step", execute_capability)
    result = await _execute_capability_lookup_step(
        {"input_key": "${read_pending.result.data}", "lookup_field": "application_id", "capability_id": 11},
        context,
        db,
        "trace-1",
        "run-1",
        "step-1",
    )

    assert calls == ["same", "same", "missing"]
    assert result["failed_count"] == 1
    assert [item.status for item in db.added] == ["SUCCESS", "SUCCESS", "OFFER_NOT_FOUND"]
    assert db.added[-1].is_retryable == 0


@pytest.mark.asyncio
async def test_capability_lookup_marks_rate_limited_item_retryable(monkeypatch):
    context = PipelineContext("trace-1", "run-1")
    context.set("read_pending", {"result": {"data": [{"application_id": "app-1"}]}})
    db = SimpleNamespace(added=[], flush=AsyncMock())
    db.add = db.added.append

    async def execute_capability(_config, _db):
        return {"status": "failed", "data": [], "error_code": "RATE_LIMITED", "error_message": "retry later"}

    monkeypatch.setattr("app.ucp.pipeline_engine._execute_capability_step", execute_capability)
    result = await _execute_capability_lookup_step(
        {"input_key": "${read_pending.result.data}", "lookup_field": "application_id", "capability_id": 11},
        context,
        db,
        "trace-1",
        "run-1",
        "step-1",
    )

    assert result["status"] == "partial_success"
    assert db.added[0].error_code == "RATE_LIMITED"
    assert db.added[0].is_retryable == 1


@pytest.mark.asyncio
async def test_capability_lookup_stop_policy_stops_after_first_failure(monkeypatch):
    context = PipelineContext("trace-1", "run-1")
    context.set("read_pending", {"result": {"data": [{"application_id": "bad"}, {"application_id": "later"}]}})
    db = SimpleNamespace(added=[], flush=AsyncMock())
    db.add = db.added.append
    calls = []

    async def execute_capability(config, _db):
        calls.append(config["params"]["application_id"])
        return {"status": "failed", "data": [], "error_code": "UPSTREAM_ERROR", "error_message": "unavailable"}

    monkeypatch.setattr("app.ucp.pipeline_engine._execute_capability_step", execute_capability)
    result = await _execute_capability_lookup_step(
        {"input_key": "${read_pending.result.data}", "lookup_field": "application_id", "capability_id": 11, "failure_policy": "STOP"},
        context,
        db,
        "trace-1",
        "run-1",
        "step-1",
    )

    assert result["status"] == "failed"
    assert calls == ["bad"]
    assert len(db.added) == 1


@pytest.mark.asyncio
async def test_beisen_report_connector_injects_selected_data_object(monkeypatch):
    resource = SimpleNamespace(
        id=7,
        resource_code="BEISEN_PENDING_HIRES",
        adapter_code="BEISEN_REPORT_PULL_ADAPTER",
        credential_id=None,
        protocol={},
        report_config={},
        circuit_breaker_config={},
    )
    data_object = SimpleNamespace(
        id=9,
        resource_id=7,
        is_active=True,
        object_config={"report_id": "pending-hire-report"},
        field_mapping={"飞书投递id": "feishu_applicaiton_id"},
    )
    db = SimpleNamespace(get=AsyncMock(side_effect=[resource, data_object]))
    received = {}

    async def adapter(params, _secrets, _db):
        received.update(params)
        return SimpleNamespace(status="success", data=[{"飞书投递id": "app-1"}], row_count=1, success_count=1, failed_count=0, extra={})

    async def write_log(*_args, **_kwargs):
        return None

    monkeypatch.setattr("app.ucp.pipeline_engine.get_adapter", lambda _code: adapter)
    monkeypatch.setattr("app.ucp.pipeline_engine._write_ucp_execution_log", write_log)

    result = await _execute_resource_step(
        {"resource_id": 7, "data_object_id": 9},
        PipelineContext("trace-1", "run-1"),
        db,
        "trace-1",
    )

    assert result["status"] == "success"
    assert received["object_config"] == {"report_id": "pending-hire-report"}
    assert result["data"] == [{"feishu_applicaiton_id": "app-1"}]

@pytest.mark.asyncio
async def test_capability_lookup_preserves_static_params(monkeypatch):
    context = PipelineContext("trace-1", "run-1")
    context.set("read_pending", {"result": {"data": [{"application_id": "app-1"}]}})
    db = SimpleNamespace(added=[], flush=AsyncMock())
    db.add = db.added.append
    received = {}

    async def execute_capability(config, _db):
        received.update(config["params"])
        return {"status": "success", "data": [{"target_bonus": 50000}], "error_code": None, "error_message": None}

    monkeypatch.setattr("app.ucp.pipeline_engine._execute_capability_step", execute_capability)
    await _execute_capability_lookup_step(
        {
            "input_key": "${read_pending.result.data}",
            "lookup_field": "application_id",
            "capability_id": 11,
            "params": {"target_bonus_custom_field_ids": ["bonus-field"]},
        },
        context,
        db,
        "trace-1",
        "run-1",
        "step-1",
    )

    assert received == {"application_id": "app-1", "target_bonus_custom_field_ids": ["bonus-field"]}