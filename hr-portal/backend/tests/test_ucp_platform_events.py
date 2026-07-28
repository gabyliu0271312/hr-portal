from types import SimpleNamespace

import pytest
from pydantic import ValidationError

from app.ucp.platform_event_catalog import get_platform_event, validate_platform_filter
from app.ucp.routers.webhook_platform import PipelineTriggerRequest


def test_platform_event_trigger_requires_a_catalog_event():
    with pytest.raises(ValidationError):
        PipelineTriggerRequest(
            trigger_code="WAREHOUSE_SYNC", trigger_name="Warehouse sync", pipeline_template_code="PIPELINE",
            trigger_type="PLATFORM_EVENT",
        )

    request = PipelineTriggerRequest(
        trigger_code="WAREHOUSE_SYNC", trigger_name="Warehouse sync", pipeline_template_code="PIPELINE",
        trigger_type="PLATFORM_EVENT", platform_event_type="datasource_sync_completed",
        filter_rule={"path": "$.sync_status", "op": "eq", "value": "success"},
    )

    assert request.platform_event_type == "datasource_sync_completed"
    assert get_platform_event(request.platform_event_type)["category"] == "DATA_CHANGE"


def test_platform_event_filter_is_limited_to_its_contract():
    validate_platform_filter("ods_table_data_changed", {"path": "$.change_type", "op": "eq", "value": "bulk_replaced"})

    with pytest.raises(ValueError):
        validate_platform_filter("ods_table_data_changed", {"path": "$.sync_status", "op": "eq", "value": "success"})


@pytest.mark.asyncio
async def test_datasource_sync_bridge_publishes_internal_ucp_event(monkeypatch):
    from app.datasources.sync_service import _publish_ucp_platform_event
    import app.ucp.event_bus as event_bus

    received: dict = {}

    async def fake_receive(_db, **kwargs):
        received.update(kwargs)
        return SimpleNamespace()

    async def fake_process(_db, event):
        received["processed_event"] = event

    monkeypatch.setattr(event_bus, "receive_event", fake_receive)
    monkeypatch.setattr(event_bus, "process_event_pipeline", fake_process)

    class Session:
        committed = False

        async def commit(self):
            self.committed = True

    session = Session()
    await _publish_ucp_platform_event(session, "datasource_sync_completed", "ods_pending_hire", {"sync_status": "success"})

    assert received["source"] == "INTERNAL"
    assert received["event_type"] == "datasource_sync_completed"
    assert received["metadata"] == {"category": "DATA_CHANGE", "source": "DATA_WAREHOUSE"}
    assert session.committed is True
