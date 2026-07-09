# -*- coding: utf-8 -*-
"""API 服务测试 — Schema 校验 + 来源验证"""
import pytest
from pydantic import ValidationError

from app.warehouse.api_service.router import (
    ApiServiceIn,
    ApiServiceUpdateIn,
)


class TestApiServiceIn:
    def test_minimal_create(self):
        payload = ApiServiceIn(
            name="员工查询API",
            source_type="table",
            source_id="dwd_employee",
            field_whitelist=[{"field": "name", "alias": "姓名"}],
        )
        assert payload.name == "员工查询API"
        assert payload.source_type == "table"
        assert payload.source_id == "dwd_employee"
        assert payload.is_active is True  # default

    def test_extra_fields_rejected(self):
        with pytest.raises(ValidationError):
            ApiServiceIn(
                name="test",
                source_type="table",
                source_id="t1",
                field_whitelist=[{"field": "x"}],
                raw_sql="DROP TABLE users",  # 红线字段
            )

    def test_empty_field_whitelist_allowed_at_schema_level(self):
        """空白名单在 schema 层通过，在 endpoint 层拒绝。"""
        payload = ApiServiceIn(
            name="test",
            source_type="table",
            source_id="t1",
            field_whitelist=[],
        )
        assert payload.field_whitelist == []

    def test_full_config(self):
        payload = ApiServiceIn(
            name="薪酬汇总API",
            description="月度薪酬数据查询",
            source_type="table",
            source_id="dws_salary_summary",
            source_label="薪酬汇总表",
            source_layer="DWS",
            field_whitelist=[
                {"field": "name", "alias": "姓名"},
                {"field": "salary", "alias": "薪资", "sensitive": True},
            ],
            filter_fields=["name", "department"],
            default_sort="name",
            page_size_max=500,
            auth_policy={"type": "token"},
            rate_limit=100,
            timeout_seconds=30,
            is_active=True,
        )
        assert payload.source_layer == "DWS"
        assert len(payload.field_whitelist) == 2
        assert payload.auth_policy["type"] == "token"


class TestApiServiceUpdateIn:
    def test_partial_update(self):
        payload = ApiServiceUpdateIn(name="新名称")
        assert payload.name == "新名称"
        assert payload.source_type is None
        assert payload.field_whitelist is None

    def test_extra_fields_rejected(self):
        with pytest.raises(ValidationError):
            ApiServiceUpdateIn(raw_sql="DROP TABLE users")
