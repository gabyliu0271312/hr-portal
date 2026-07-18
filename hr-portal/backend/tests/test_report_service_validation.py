from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException, status

from app.reports import report_service


@pytest.mark.asyncio
async def test_scheduled_report_without_owner_never_queries(monkeypatch):
    query = AsyncMock()
    monkeypatch.setattr('app.reports.sql_builder.run_dataset_query', query)
    report = SimpleNamespace(id=1, dataset_id=1, owner_id=None, config={})

    with pytest.raises(RuntimeError, match='创建人'):
        await report_service.run_report_query(report, SimpleNamespace(get=AsyncMock()))

    query.assert_not_awaited()


@pytest.mark.asyncio
async def test_scheduled_report_rejects_invalid_instance_before_query(monkeypatch):
    query = AsyncMock()
    monkeypatch.setattr('app.reports.sql_builder.run_dataset_query', query)
    owner = SimpleNamespace(id=8)
    db = SimpleNamespace(get=AsyncMock(return_value=owner))
    report = SimpleNamespace(
        id=2,
        dataset_id=1,
        owner_id=8,
        config={'columns': [{'source_code': 'r.amount', 'instance_id': 'r.amount#bad'}]},
    )

    with pytest.raises(HTTPException) as error:
        await report_service.run_report_query(report, db)

    assert error.value.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY
    query.assert_not_awaited()


@pytest.mark.asyncio
async def test_scheduled_report_uses_owner_for_query(monkeypatch):
    owner = SimpleNamespace(id=9)
    query = AsyncMock(return_value=([], [], 3))
    monkeypatch.setattr('app.reports.sql_builder.run_dataset_query', query)
    monkeypatch.setattr(report_service, 'ensure_valid_report_field_references', AsyncMock())
    report = SimpleNamespace(
        id=3,
        name='scheduled',
        dataset_id=1,
        owner_id=9,
        config={'columns': []},
        scope_strategy=None,
        last_run_at=None,
        run_count=0,
    )

    total, _ = await report_service.run_report_query(
        report, SimpleNamespace(get=AsyncMock(return_value=owner))
    )

    assert total == 3
    assert query.await_args.kwargs['user'] is owner


@pytest.mark.asyncio
async def test_scheduled_report_missing_owner_record_never_queries(monkeypatch):
    query = AsyncMock()
    monkeypatch.setattr('app.reports.sql_builder.run_dataset_query', query)
    report = SimpleNamespace(id=4, dataset_id=1, owner_id=10, config={})

    with pytest.raises(RuntimeError, match='创建人'):
        await report_service.run_report_query(report, SimpleNamespace(get=AsyncMock(return_value=None)))

    query.assert_not_awaited()
