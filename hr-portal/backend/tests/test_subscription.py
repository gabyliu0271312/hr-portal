# -*- coding: utf-8 -*-
"""订阅管理测试 — Schema 校验"""
import pytest
from pydantic import ValidationError

from app.warehouse.subscription.router import SubscriptionIn, SubscriptionUpdateIn


class TestSubscriptionIn:
    def test_minimal_create(self):
        payload = SubscriptionIn(
            name="每周薪酬报表",
            source_type="ads",
            source_id="ads_salary",
            recipients=[{"type": "user", "id": 1}],
        )
        assert payload.name == "每周薪酬报表"
        assert payload.source_type == "ads"
        assert len(payload.recipients) == 1

    def test_extra_fields_rejected(self):
        with pytest.raises(ValidationError):
            SubscriptionIn(
                name="test",
                source_type="table",
                source_id="t1",
                recipients=[{"type": "user", "id": 1}],
                raw_sql="DROP TABLE users",
            )

    def test_full_config(self):
        payload = SubscriptionIn(
            name="日报",
            source_type="report",
            source_id="123",
            source_label="日报表",
            source_layer="REPORT",
            field_scope=[{"field": "name"}],
            recipients=[
                {"type": "user", "id": 1, "target": "feishu"},
                {"type": "group", "id": "chat_abc"},
            ],
            delivery_target="feishu",
            frequency="daily",
            cron_expr="0 9 * * *",
            push_format="markdown",
            is_active=True,
        )
        assert payload.frequency == "daily"
        assert payload.delivery_target == "feishu"
        assert len(payload.recipients) == 2


class TestSubscriptionUpdateIn:
    def test_partial_update(self):
        payload = SubscriptionUpdateIn(name="新名称")
        assert payload.name == "新名称"
        assert payload.recipients is None

    def test_extra_fields_rejected(self):
        with pytest.raises(ValidationError):
            SubscriptionUpdateIn(raw_sql="DROP TABLE users")
