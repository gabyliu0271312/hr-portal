from types import SimpleNamespace

import pytest

from app.ucp.warehouse_ingest_service import (
    IngestBatchConflictError,
    mark_ingest_batch_failed,
    mark_ingest_batch_processing,
    mark_ingest_batch_succeeded,
    reserve_ingest_batch,
    serialize_ingest_batch,
)


class Result:
    def __init__(self, value):
        self.value = value

    def scalar_one_or_none(self):
        return self.value


class Session:
    def __init__(self, results):
        self.results = list(results)
        self.added = []
        self.flushed = 0

    async def scalar(self, _statement):
        return self.results.pop(0)

    def add(self, item):
        self.added.append(item)

    async def flush(self):
        self.flushed += 1

    def begin_nested(self):
        session = self

        class Savepoint:
            async def __aenter__(self):
                return session

            async def __aexit__(self, *_args):
                return False

        return Savepoint()


@pytest.mark.asyncio
async def test_reserve_ingest_batch_creates_new_batch():
    db = Session([None, None])

    batch, created = await reserve_ingest_batch(
        db,
        resource_id=1,
        target_asset="emp_monthly_allocation",
        event_id="request-1",
        batch_id="batch-1",
        period_value="202607",
        payload_checksum="a" * 64,
        received_rows=2,
        trace_id="trace-1",
    )

    assert created is True
    assert db.added == [batch]
    assert db.flushed == 1
    assert batch.status == "RECEIVED"
    assert batch.received_rows == 2


@pytest.mark.asyncio
async def test_reserve_ingest_batch_reuses_matching_event():
    existing = SimpleNamespace(payload_checksum="a" * 64)
    db = Session([existing])

    batch, created = await reserve_ingest_batch(
        db,
        resource_id=1,
        target_asset="emp_monthly_allocation",
        event_id="request-1",
        batch_id="batch-1",
        period_value="202607",
        payload_checksum="a" * 64,
        received_rows=2,
        trace_id=None,
    )

    assert batch is existing
    assert created is False
    assert db.added == []


@pytest.mark.asyncio
async def test_reserve_ingest_batch_rejects_conflicting_event_or_batch():
    existing_event = SimpleNamespace(payload_checksum="a" * 64)
    with pytest.raises(IngestBatchConflictError, match="请求标识"):
        await reserve_ingest_batch(
            Session([existing_event]),
            resource_id=1,
            target_asset="emp_monthly_allocation",
            event_id="request-1",
            batch_id="batch-1",
            period_value="202607",
            payload_checksum="b" * 64,
            received_rows=2,
            trace_id=None,
        )

    existing_batch = SimpleNamespace(payload_checksum="a" * 64)
    with pytest.raises(IngestBatchConflictError, match="批次标识"):
        await reserve_ingest_batch(
            Session([None, existing_batch]),
            resource_id=1,
            target_asset="emp_monthly_allocation",
            event_id="request-2",
            batch_id="batch-1",
            period_value="202607",
            payload_checksum="b" * 64,
            received_rows=2,
            trace_id=None,
        )


def test_ingest_batch_state_helpers():
    batch = SimpleNamespace(status="RECEIVED", pipeline_run_id=None, written_rows=0, error_summary="old", processed_at=None)

    mark_ingest_batch_processing(batch, "run-1")
    assert (batch.status, batch.pipeline_run_id) == ("PROCESSING", "run-1")

    mark_ingest_batch_succeeded(batch, 3)
    assert batch.status == "SUCCEEDED"
    assert batch.written_rows == 3
    assert batch.error_summary is None
    assert batch.processed_at is not None

    mark_ingest_batch_failed(batch, "x" * 2000, dead_letter=True)
    assert batch.status == "DEAD_LETTER"
    assert len(batch.error_summary) == 1000


def test_serialize_ingest_batch_excludes_payload_and_secrets():
    batch = SimpleNamespace(
        batch_id="batch-1", event_id="request-1", status="SUCCEEDED",
        target_asset="emp_monthly_allocation", period_value="202607",
        received_rows=2, written_rows=2, processed_at=None, received_at=None,
        trace_id="trace-1", error_summary=None, pipeline_run_id="run-1",
        payload={"employee_no": "000123"}, signing_secret="should-not-leak",
    )

    assert serialize_ingest_batch(batch) == {
        "batch_id": "batch-1", "event_id": "request-1", "status": "SUCCEEDED",
        "target_asset": "emp_monthly_allocation", "period_value": "202607",
        "received_rows": 2, "written_rows": 2, "processed_at": None,
        "received_at": None, "trace_id": "trace-1", "error_summary": None,
        "pipeline_run_id": "run-1",
    }
