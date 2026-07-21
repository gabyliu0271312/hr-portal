from datetime import datetime, timezone

import pytest

from app.ai.maintenance import purge_controlled_action_data
from app.scheduler.handlers import JOB_HANDLERS


class DeleteResult:
    def __init__(self, rowcount):
        self.rowcount = rowcount


class FakeDb:
    def __init__(self):
        self.calls = 0

    async def execute(self, statement):
        self.calls += 1
        return DeleteResult(self.calls)


@pytest.mark.asyncio
async def test_purge_controlled_action_data_cleans_all_public_state_categories():
    result = await purge_controlled_action_data(
        FakeDb(),
        audit_retention_days=180,
        state_retention_days=7,
        now=datetime.now(timezone.utc),
    )
    assert result == {
        "controlled_actions": 1,
        "rate_limits": 2,
        "channel_events": 3,
        "channel_sessions": 4,
        "audits": 5,
    }


def test_controlled_action_retention_is_registered_as_a_scheduler_job():
    assert "ai_controlled_action_retention" in JOB_HANDLERS
