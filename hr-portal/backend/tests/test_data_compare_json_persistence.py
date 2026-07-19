"""Regression tests for persisting amount comparison results."""
import json
from datetime import date
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from app.data_compare.service import record_skill_run, to_json_compatible


def test_to_json_compatible_converts_amount_compare_values():
    result = {
        "summary": {"total_amount_a": Decimal("12345.67")},
        "details": [
            {
                "employee_no": "E001",
                "amount_a": Decimal("1000.00"),
                "run_date": date(2026, 6, 30),
            }
        ],
    }

    persisted = to_json_compatible(result)

    assert persisted["summary"]["total_amount_a"] == 12345.67
    assert persisted["details"][0]["amount_a"] == 1000.0
    assert persisted["details"][0]["run_date"] == "2026-06-30"
    json.dumps(persisted)


@pytest.mark.asyncio
async def test_record_skill_run_persists_json_compatible_result():
    skill = SimpleNamespace(last_run_at=None, last_run_result=None, run_count=2)
    db = AsyncMock()
    db.get.return_value = skill

    await record_skill_run(
        db,
        3,
        {"details": [{"salary": Decimal("35000.50")}], "summary": {}},
    )

    assert skill.last_run_result == {"details": [{"salary": 35000.5}], "summary": {}}
    assert skill.run_count == 3
    db.commit.assert_awaited_once()
