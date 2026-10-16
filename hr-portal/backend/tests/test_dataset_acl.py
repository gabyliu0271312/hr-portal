# -*- coding: utf-8 -*-
"""数据集 ACL 局部更新契约测试。"""

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from app.datasets.models import DataSet
from app.datasets.router import DatasetAclUpdateIn, _can_consume, _validate_acl_payload


def test_acl_update_payload_defaults_to_empty_acl():
    payload = DatasetAclUpdateIn()

    assert payload.acl == []


def test_acl_update_payload_rejects_empty_grant():
    payload = DatasetAclUpdateIn(acl=[{"role_id": None, "user_id": None}])

    with pytest.raises(HTTPException, match="必须指定角色或用户"):
        _validate_acl_payload(payload)


def test_acl_update_payload_accepts_user_grant():
    payload = DatasetAclUpdateIn(acl=[{"user_id": 17}])

    _validate_acl_payload(payload)
    assert payload.acl[0].user_id == 17


def test_acl_update_payload_rejects_invalid_id_type():
    with pytest.raises(ValidationError):
        DatasetAclUpdateIn(acl=[{"user_id": "not-an-id"}])


@pytest.mark.asyncio
@pytest.mark.parametrize("dataset_status,active", [("draft", True), ("published", False), ("disabled", True)])
async def test_dataset_consume_denies_non_consumable_status_before_acl(dataset_status, active, monkeypatch):
    from unittest.mock import AsyncMock
    from app.datasets import router

    access = AsyncMock(return_value=True)
    monkeypatch.setattr(router, "_can_access", access)
    dataset = DataSet(id=1, status=dataset_status, is_active=active)
    assert await _can_consume(object(), dataset, object()) is False
    access.assert_not_awaited()


@pytest.mark.asyncio
async def test_dataset_consume_requires_current_acl(monkeypatch):
    from unittest.mock import AsyncMock
    from app.datasets import router

    access = AsyncMock(side_effect=[True, False])
    monkeypatch.setattr(router, "_can_access", access)
    dataset = DataSet(id=1, status="published", is_active=True)
    assert await _can_consume(object(), dataset, object()) is True
    assert await _can_consume(object(), dataset, object()) is False
    assert access.await_count == 2
