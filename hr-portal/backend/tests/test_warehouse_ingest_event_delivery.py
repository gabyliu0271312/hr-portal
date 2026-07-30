from types import SimpleNamespace

import pytest


class _Result:
    def __init__(self, values):
        self.values = values

    def scalars(self):
        return self

    def __iter__(self):
        return iter(self.values)


class _Session:
    def __init__(self, event, batch, pipeline, delivery):
        self.event = event
        self.batch = batch
        self.pipeline = pipeline
        self.delivery = delivery

    async def get(self, model, _key):
        if model.__name__ == "UcpEvent":
            return self.event
        if model.__name__ == "UcpEventDelivery":
            return self.delivery
        return None

    async def scalar(self, _statement):
        return self.pipeline

    async def execute(self, _statement):
        return _Result([self.delivery.status])

    async def commit(self):
        return None

    async def rollback(self):
        self.rollback_count = getattr(self, "rollback_count", 0) + 1
        return None


class _SessionContext:
    def __init__(self, session):
        self.session = session

    async def __aenter__(self):
        return self.session

    async def __aexit__(self, *_args):
        return False


async def _run_background(event_bus):
    await event_bus._run_pipeline_in_background(
        pipeline_code="COST_ALLOCATION_INGEST", run_id="run-1", trace_id="trace-1",
        event_payload={"records": []}, run_as_type="SERVICE_ACCOUNT", service_account_code=None,
        event_db_id=1, event_id="request-1", trigger_code="allocation-locked", delivery_id=2,
    )


def _setup(monkeypatch, *, execution, event_status="DISPATCHED", batch_status="RECEIVED"):
    event = SimpleNamespace(id=1, resource_id=9, status=event_status, trace_id="trace-1", error_code=None, error_message=None, completed_at=None)
    batch = SimpleNamespace(target_asset="emp_monthly_allocation", batch_id="batch-1", period_value=None, status=batch_status, pipeline_run_id="run-old" if batch_status == "DEAD_LETTER" else None, written_rows=0, error_summary="old" if batch_status == "DEAD_LETTER" else None, processed_at=None)
    pipeline = SimpleNamespace(steps=[{"type": "WAREHOUSE_ASSET_SINK", "target_asset": "emp_monthly_allocation"}])
    delivery = SimpleNamespace(status="RUNNING", attempt=2 if batch_status == "DEAD_LETTER" else 1, error_code=None, error_message=None, last_retry_at=None, next_retry_at=None)
    session = _Session(event, batch, pipeline, delivery)
    monkeypatch.setattr("app.core.db.get_session_factory", lambda: lambda: _SessionContext(session))

    async def get_batch(_db, **_kwargs):
        return batch

    async def execute_pipeline(**_kwargs):
        return execution

    monkeypatch.setattr("app.ucp.warehouse_ingest_service.get_ingest_batch_for_event", get_batch)
    monkeypatch.setattr("app.ucp.pipeline_engine.execute_pipeline", execute_pipeline)
    return batch, delivery


@pytest.mark.asyncio
async def test_background_ingest_transitions_to_succeeded_and_publishes_asset_event(monkeypatch):
    import app.ucp.event_bus as event_bus

    execution = SimpleNamespace(status="SUCCESS", context_summary={"sink": {"extra": {"target_asset": "emp_monthly_allocation", "write_mode": "period_full_snapshot", "written_count": 2, "period_value": "202607"}}})
    batch, delivery = _setup(monkeypatch, execution=execution)
    enqueued = []

    async def mark_success(_db, item):
        item.status = "SUCCESS"

    async def enqueue(_db, **kwargs):
        enqueued.append(kwargs)

    monkeypatch.setattr("app.ucp.event_reliability.mark_delivery_success", mark_success)
    monkeypatch.setattr("app.ucp.outbox_service.enqueue_asset_change", enqueue)
    await _run_background(event_bus)

    assert batch.status == "SUCCEEDED"
    assert batch.period_value == "202607"
    assert batch.written_rows == 2
    assert delivery.status == "SUCCESS"
    assert enqueued and enqueued[0]["dedup_key"] == "warehouse:9:emp_monthly_allocation:batch-1"
    assert enqueued[0]["payload"]["affected_row_count"] == 2


@pytest.mark.asyncio
async def test_background_ingest_marks_validation_failure_dead_letter_without_retry(monkeypatch):
    import app.ucp.event_bus as event_bus

    batch, delivery = _setup(monkeypatch, execution=SimpleNamespace(status="FAILED", error_message="聚合校验失败: allocation percentage", context_summary={}))

    async def mark_failed(_db, item, **kwargs):
        assert kwargs["retryable"] is False
        item.status = "DEAD_LETTER"

    monkeypatch.setattr("app.ucp.event_reliability.mark_delivery_failed", mark_failed)
    await _run_background(event_bus)

    assert delivery.status == "DEAD_LETTER"
    assert batch.status == "DEAD_LETTER"
    assert "聚合校验失败" in batch.error_summary


@pytest.mark.asyncio
async def test_background_ingest_marks_operational_failure_retryable(monkeypatch):
    import app.ucp.event_bus as event_bus

    batch, delivery = _setup(monkeypatch, execution=SimpleNamespace(status="FAILED", error_message="database connection reset", context_summary={}))

    async def mark_failed(_db, item, **kwargs):
        assert kwargs["retryable"] is True
        item.status = "FAILED"
        item.next_retry_at = object()

    monkeypatch.setattr("app.ucp.event_reliability.mark_delivery_failed", mark_failed)
    await _run_background(event_bus)

    assert delivery.status == "FAILED"
    assert delivery.next_retry_at is not None
    assert batch.status == "FAILED"
    assert batch.error_summary == "database connection reset"


@pytest.mark.asyncio
async def test_replayed_batch_returns_from_dead_letter_to_succeeded(monkeypatch):
    import app.ucp.event_bus as event_bus

    execution = SimpleNamespace(status="SUCCESS", context_summary={"sink": {"extra": {"target_asset": "emp_monthly_allocation", "write_mode": "period_full_snapshot", "written_count": 2, "period_value": "202607"}}})
    batch, delivery = _setup(monkeypatch, execution=execution, event_status="DEAD_LETTER", batch_status="DEAD_LETTER")

    async def mark_success(_db, item):
        item.status = "SUCCESS"

    async def publish(*_args):
        return None

    monkeypatch.setattr("app.ucp.event_reliability.mark_delivery_success", mark_success)
    monkeypatch.setattr("app.datasources.sync_service._publish_ods_data_changed_event", publish)
    await _run_background(event_bus)

    assert batch.status == "SUCCEEDED"
    assert batch.pipeline_run_id == "run-1"
    assert batch.written_rows == 2
    assert delivery.status == "SUCCESS"


@pytest.mark.asyncio
async def test_background_ingest_rolls_back_before_persisting_failure_state(monkeypatch):
    import app.ucp.event_bus as event_bus

    batch, _delivery = _setup(
        monkeypatch,
        execution=SimpleNamespace(status="FAILED", error_message="聚合校验失败", context_summary={}),
    )
    session = None

    def factory():
        nonlocal session
        event = SimpleNamespace(id=1, resource_id=9, status="DISPATCHED", trace_id="trace-1", error_code=None, error_message=None, completed_at=None)
        pipeline = SimpleNamespace(steps=[{"type": "WAREHOUSE_ASSET_SINK", "target_asset": "emp_monthly_allocation"}])
        delivery = SimpleNamespace(status="RUNNING", attempt=1, error_code=None, error_message=None, last_retry_at=None, next_retry_at=None)
        session = _Session(event, batch, pipeline, delivery)
        return _SessionContext(session)

    monkeypatch.setattr("app.core.db.get_session_factory", lambda: factory)

    async def get_batch(_db, **_kwargs): return batch
    async def execute_pipeline(**_kwargs): return SimpleNamespace(status="FAILED", error_message="聚合校验失败", context_summary={})
    async def mark_failed(_db, item, **_kwargs): item.status = "DEAD_LETTER"

    monkeypatch.setattr("app.ucp.warehouse_ingest_service.get_ingest_batch_for_event", get_batch)
    monkeypatch.setattr("app.ucp.pipeline_engine.execute_pipeline", execute_pipeline)
    monkeypatch.setattr("app.ucp.event_reliability.mark_delivery_failed", mark_failed)
    await _run_background(event_bus)

    assert session.rollback_count == 1
    assert batch.status == "DEAD_LETTER"
