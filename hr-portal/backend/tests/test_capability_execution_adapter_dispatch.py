from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from app.ucp import capability_execution


@pytest.mark.asyncio
async def test_non_generic_operation_dispatches_to_its_registered_adapter(monkeypatch):
    db = SimpleNamespace(get=AsyncMock())
    operation = SimpleNamespace(adapter_code="FEISHU_OFFER_DETAIL_ADAPTER", executor_template_id=None)
    adapter = AsyncMock(return_value=SimpleNamespace(status="success", data=[{"salary_amount": 29800}], row_count=1))

    monkeypatch.setattr(capability_execution, "get_adapter", lambda code: adapter if code == operation.adapter_code else None)
    monkeypatch.setattr(capability_execution, "decrypt_credential_secrets", AsyncMock(return_value={"app_id": "id", "app_secret": "secret"}))

    result = await capability_execution.execute_operation_template(
        db,
        operation,
        9,
        {"application_id": "application-1"},
        require_published=True,
    )

    assert result.status == "success"
    assert result.data == [{"salary_amount": 29800}]
    adapter.assert_awaited_once_with({"application_id": "application-1"}, {"app_id": "id", "app_secret": "secret"}, db)
    db.get.assert_not_awaited()
