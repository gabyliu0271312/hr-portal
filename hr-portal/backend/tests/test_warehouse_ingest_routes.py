import inspect
from types import SimpleNamespace

import pytest
from fastapi import HTTPException


def test_ingest_batch_list_route_requires_monitor_view_permission():
    from app.ucp.routers.monitor import route_list_ingest_batches

    user = inspect.signature(route_list_ingest_batches).parameters["_user"]
    closure = user.default.dependency.__closure__ or ()
    values = {cell.cell_contents for cell in closure}
    assert {"ucp.monitor", "V"}.issubset(values)


@pytest.mark.asyncio
async def test_get_ingest_batch_route_authorizes_then_returns_masked_summary(monkeypatch):
    from app.ucp.routers import monitor

    authorized = []

    async def authorize(request, resource_code, db):
        authorized.append((request, resource_code, db))

    async def get_batch(_db, *, resource_code, batch_id):
        assert (resource_code, batch_id) == ("cost-allocation-locked", "batch-1")
        return SimpleNamespace(batch_id="batch-1")

    monkeypatch.setattr(monitor, "_authorize_ingest_status_request", authorize)
    monkeypatch.setattr(monitor, "get_ingest_batch", get_batch)
    monkeypatch.setattr(monitor, "serialize_ingest_batch", lambda value: {"batch_id": value.batch_id, "status": "SUCCEEDED"})
    result = await monitor.route_get_ingest_batch("cost-allocation-locked", "batch-1", object(), object())

    assert result == {"batch_id": "batch-1", "status": "SUCCEEDED"}
    assert authorized


@pytest.mark.asyncio
async def test_get_ingest_batch_route_returns_404(monkeypatch):
    from app.ucp.routers import monitor

    async def authorize(*_args):
        return None

    async def get_batch(*_args, **_kwargs):
        return None

    monkeypatch.setattr(monitor, "_authorize_ingest_status_request", authorize)
    monkeypatch.setattr(monitor, "get_ingest_batch", get_batch)
    with pytest.raises(HTTPException) as exc:
        await monitor.route_get_ingest_batch("missing", "batch-1", object(), object())
    assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_list_ingest_batches_passes_filters_and_paginates(monkeypatch):
    from app.ucp.routers import monitor

    batch = SimpleNamespace(batch_id="batch-1")
    received = {}

    async def fake_list(_db, **kwargs):
        received.update(kwargs)
        return [(batch, "cost-allocation-locked")], 1

    monkeypatch.setattr(monitor, "list_ingest_batches", fake_list)
    monkeypatch.setattr(monitor, "serialize_ingest_batch", lambda value: {"batch_id": value.batch_id})
    result = await monitor.route_list_ingest_batches(
        resource_code="cost-allocation-locked", target_asset="emp_monthly_allocation",
        period_value="202607", status="FAILED", limit=20, offset=10, db=object(), _user=object(),
    )
    assert received == {"resource_code": "cost-allocation-locked", "target_asset": "emp_monthly_allocation", "period_value": "202607", "status": "FAILED", "limit": 20, "offset": 10}
    assert result == {"total": 1, "items": [{"batch_id": "batch-1", "resource_code": "cost-allocation-locked"}]}


@pytest.mark.asyncio
async def test_replay_ingest_batch_only_allows_failed_batches(monkeypatch):
    from app.ucp.routers import monitor

    batch = SimpleNamespace(batch_id="batch-1", event_id="request-1", status="DEAD_LETTER")

    async def get_batch(_db, **_kwargs): return batch
    async def replay(_db, **kwargs):
        assert kwargs["event_uuid"] == "request-1"
        assert kwargs["allow_delivered_replay"] is True
        return SimpleNamespace(event_id="request-1", status="DISPATCHED")

    monkeypatch.setattr(monitor, "get_ingest_batch", get_batch)
    monkeypatch.setattr("app.ucp.event_reliability.replay_event", replay)
    result = await monitor.route_replay_ingest_batch("cost-allocation-locked", "batch-1", object(), SimpleNamespace(login_name="operator", username=None))
    assert result == {"batch_id": "batch-1", "event_id": "request-1", "status": "DISPATCHED"}


@pytest.mark.asyncio
async def test_replay_ingest_batch_rejects_non_failed_status(monkeypatch):
    from app.ucp.routers import monitor

    async def get_batch(_db, **_kwargs): return SimpleNamespace(status="SUCCEEDED")
    monkeypatch.setattr(monitor, "get_ingest_batch", get_batch)
    with pytest.raises(HTTPException) as error:
        await monitor.route_replay_ingest_batch("cost-allocation-locked", "batch-1", object(), object())
    assert error.value.status_code == 409
