from datetime import UTC, datetime

import pytest

from app.performance import models
from app.performance.auth_context import PerformanceAccessContext
from app.performance.role_configuration_router import (
    PerformanceRoleCreateIn,
    create_performance_role,
)


class _FakeResult:
    def __init__(self, value=None):
        self.value = value

    def scalar_one_or_none(self):
        return self.value


class _FakeRoleDb:
    def __init__(self):
        self.items = []
        self.commits = 0
        self._next_id = 1

    async def execute(self, _statement):
        return _FakeResult(None)

    def add(self, item):
        self.items.append(item)

    async def flush(self):
        for item in self.items:
            if isinstance(item, models.PerformanceRole) and item.id is None:
                item.id = self._next_id
                self._next_id += 1
                item.created_at = datetime.now(UTC)
                item.updated_at = item.created_at

    async def commit(self):
        self.commits += 1

    async def refresh(self, _item):
        return None


def _context() -> PerformanceAccessContext:
    return PerformanceAccessContext(
        subject_type="SYSTEM_ACCOUNT",
        subject_id=1,
        display_name="绩效管理员",
        account_type="PERFORMANCE_SUPER_ADMIN",
        portal_entry_permissions=("performance.admin",),
        role_grants=(),
        permission_codes=("performance.authorization.manage",),
    )


@pytest.mark.asyncio
async def test_create_performance_role_persists_and_audits_name_and_description():
    db = _FakeRoleDb()

    result = await create_performance_role(
        PerformanceRoleCreateIn(name="  校准人  ", description="  负责校准  "),
        context=_context(),
        db=db,
    )

    role = next(item for item in db.items if isinstance(item, models.PerformanceRole))
    assert result.name == "校准人"
    assert result.description == "负责校准"
    assert role.code.startswith("custom.")
    assert role.is_system is False
    assert db.commits == 1
    audit = next(item for item in db.items if isinstance(item, models.PerformanceAuditEvent))
    assert audit.event_type == "PERFORMANCE_ROLE_CREATED"
    assert audit.after_state["name"] == "校准人"


def test_create_performance_role_rejects_blank_name_and_unknown_fields():
    with pytest.raises(ValueError):
        PerformanceRoleCreateIn(name="   ")
    with pytest.raises(ValueError):
        PerformanceRoleCreateIn(name="校准人", unknown=True)
