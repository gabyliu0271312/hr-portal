# -*- coding: utf-8 -*-
"""数据集 ACL 局部更新契约测试。"""

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from app.datasets.router import DatasetAclUpdateIn, _validate_acl_payload


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