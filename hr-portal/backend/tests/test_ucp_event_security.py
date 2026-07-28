from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.ucp.event_bus import EventBusError
from app.ucp.event_reliability import replay_event
from app.ucp.routers.events import create_trigger, get_raw_event_payload, update_trigger


@pytest.mark.asyncio
async def test_legacy_trigger_writes_are_retired_before_touching_the_database():
    with pytest.raises(HTTPException) as create_error:
        await create_trigger({"trigger_code": "NEW"}, db=None, _user=None)
    with pytest.raises(HTTPException) as update_error:
        await update_trigger("NEW", {}, db=None, _user=None)

    assert create_error.value.status_code == 410
    assert update_error.value.status_code == 410


@pytest.mark.asyncio
async def test_direct_replay_rejects_a_successfully_delivered_event(monkeypatch):
    event = SimpleNamespace(status="DISPATCHED")

    async def get_event(_db, _event_uuid):
        return event

    monkeypatch.setattr("app.ucp.event_bus.get_event", get_event)

    class Session:
        async def flush(self):
            raise AssertionError("a non-replayable event must not be changed")

    with pytest.raises(EventBusError) as error:
        await replay_event(Session(), event_uuid="event-1")

    assert error.value.code == "EVENT_NOT_REPLAYABLE"


@pytest.mark.asyncio
async def test_raw_event_payload_access_requires_reason_and_is_audited(monkeypatch):
    event = SimpleNamespace(id=7, event_id="event-7", payload={"employee_id": "E-1"}, metadata_={})

    async def get_event(_db, _event_id):
        return event

    monkeypatch.setattr("app.ucp.event_bus.get_event", get_event)

    class Session:
        def __init__(self):
            self.added = []
            self.committed = False

        def add(self, value):
            self.added.append(value)

        async def commit(self):
            self.committed = True

    user = SimpleNamespace(username="security-admin")
    session = Session()
    result = await get_raw_event_payload("event-7", reason="Investigate a failed offboarding event", db=session, _user=user)

    assert result["payload"] == {"employee_id": "E-1"}
    assert result["audited"] is True
    assert session.added[0].operator == "security-admin"
    assert session.committed is True
