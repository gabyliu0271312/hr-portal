from types import SimpleNamespace

import pytest

from app.performance.projects_router import _overdue_submission_allowed


class Db:
    def __init__(self, cycle, setting=None):
        self.cycle = cycle
        self.setting = setting

    async def scalar(self, _query):
        return self.cycle

    async def get(self, model, _identity):
        return self.setting


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("enabled", "scope", "node_type", "expected"),
    [
        (False, "EVALUATION", "evaluation", False),
        (False, "EVALUATION", "work_summary", True),
        (False, "ALL", "work_summary", False),
        (True, "ALL", "evaluation", True),
    ],
)
async def test_overdue_submission_policy_reads_current_cycle_values(enabled, scope, node_type, expected):
    cycle = SimpleNamespace(cycle_ref="cycle:1", overdue_submission_enabled=enabled, overdue_submission_scope=scope)
    setting = SimpleNamespace(overdue_single_submission_enabled=True, cycle_overdue_submission_override_enabled=True)
    task = SimpleNamespace(cycle_ref="cycle:1")
    node = SimpleNamespace(node_type=node_type)
    assert await _overdue_submission_allowed(task, node, Db(cycle, setting)) is expected


@pytest.mark.asyncio
async def test_overdue_cycle_override_is_ignored_when_global_gate_is_off():
    cycle = SimpleNamespace(cycle_ref="cycle:1", overdue_submission_enabled=False, overdue_submission_scope="ALL")
    setting = SimpleNamespace(overdue_single_submission_enabled=True, cycle_overdue_submission_override_enabled=False)
    assert await _overdue_submission_allowed(SimpleNamespace(cycle_ref="cycle:1"), SimpleNamespace(node_type="work_summary"), Db(cycle, setting)) is True


@pytest.mark.asyncio
async def test_overdue_submission_policy_global_switch_overrides_cycle():
    cycle = SimpleNamespace(cycle_ref="cycle:1", overdue_submission_enabled=True, overdue_submission_scope="EVALUATION")
    setting = SimpleNamespace(overdue_single_submission_enabled=False, cycle_overdue_submission_override_enabled=True)
    assert await _overdue_submission_allowed(SimpleNamespace(cycle_ref="cycle:1"), SimpleNamespace(node_type="evaluation"), Db(cycle, setting)) is False
