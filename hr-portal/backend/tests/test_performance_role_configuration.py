from datetime import UTC, datetime
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.performance import models
from app.performance.auth_context import PerformanceAccessContext
from app.performance.role_configuration_router import (
    PerformanceRoleCreateIn,
    PerformanceRoleStatusIn,
    PerformanceRoleUpdateIn,
    _context as role_permission_context,
    create_performance_role,
    delete_performance_role,
    update_performance_role,
    update_performance_role_status,
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
        self.role = None
        self.deleted = None

    async def get(self, _model, _role_id):
        return self.role

    async def execute(self, _statement):
        return _FakeResult(None)

    async def delete(self, item):
        self.deleted = item

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
    assert role.role_type == "MANAGEMENT"
    assert role.member_source is None
    assert db.commits == 1
    audit = next(item for item in db.items if isinstance(item, models.PerformanceAuditEvent))
    assert audit.event_type == "PERFORMANCE_ROLE_CREATED"
    assert audit.after_state["name"] == "校准人"


@pytest.mark.asyncio
async def test_create_assessment_role_sets_member_source_and_bilingual_fields():
    db = _FakeRoleDb()
    result = await create_performance_role(
        PerformanceRoleCreateIn(
            name="评估助手",
            name_en="Assessment assistant",
            description="评估协助",
            description_en="Evaluation support",
            role_type="ASSESSMENT",
        ),
        context=_context(),
        db=db,
    )

    role = next(item for item in db.items if isinstance(item, models.PerformanceRole))
    assert role.role_type == "ASSESSMENT"
    assert role.member_source == "在周期中导入"
    assert role.name_en == "Assessment assistant"
    assert role.description_en == "Evaluation support"
    assert result.role_type == "ASSESSMENT"
    assert result.member_source == "在周期中导入"


def test_create_performance_role_rejects_blank_name_and_unknown_fields():
    with pytest.raises(ValueError):
        PerformanceRoleCreateIn(name="   ")
    with pytest.raises(ValueError):
        PerformanceRoleCreateIn(name="校准人", unknown=True)


def test_role_status_input_rejects_invalid_payload():
    with pytest.raises(ValueError):
        PerformanceRoleStatusIn(is_active="unknown")
    with pytest.raises(ValueError):
        PerformanceRoleStatusIn(is_active=False, extra=True)


def _role(*, active=False, system=False, role_type="MANAGEMENT", function_permission_keys=()):
    return SimpleNamespace(
        id=8, code="custom.test", name="自定义角色", name_en=None, description="备注", description_en=None,
        role_type=role_type,
        member_source="在周期中导入" if role_type == "ASSESSMENT" else None,
        function_permission_keys=list(function_permission_keys), is_system=system, is_active=active,
        updated_at=datetime.now(UTC),
    )


@pytest.mark.asyncio
async def test_update_custom_role_persists_changes_and_audits():
    db = _FakeRoleDb()
    db.role = _role()
    result = await update_performance_role(
        8,
        PerformanceRoleUpdateIn(
            name="项目管理员",
            description="管理项目",
            function_permission_keys=["performance.backend.cycles-projects"],
        ),
        _context(),
        db,
    )
    assert result.name == "项目管理员"
    assert result.description == "管理项目"
    assert result.function_permission_keys == ["performance.backend.cycles-projects"]
    assert db.commits == 1
    assert db.items[-1].event_type == "PERFORMANCE_ROLE_UPDATED"


@pytest.mark.asyncio
async def test_update_system_role_is_rejected():
    db = _FakeRoleDb()
    db.role = _role(system=True, function_permission_keys=["performance.frontend.progress"])
    with pytest.raises(HTTPException) as error:
        await update_performance_role(
            8,
            PerformanceRoleUpdateIn(name="项目管理员"),
            _context(),
            db,
        )
    assert error.value.status_code == 400
    assert error.value.detail == "系统角色不可编辑"
    assert db.commits == 0


@pytest.mark.asyncio
async def test_update_assessment_role_allows_bilingual_fields():
    db = _FakeRoleDb()
    db.role = _role(role_type="ASSESSMENT", active=True)
    result = await update_performance_role(
        8,
        PerformanceRoleUpdateIn(name="评估助手", name_en="Assessment assistant", description="评估协助", description_en="Evaluation support"),
        _context(),
        db,
    )
    assert result.name == "评估助手"
    assert result.name_en == "Assessment assistant"
    assert result.description == "评估协助"
    assert result.description_en == "Evaluation support"
    assert db.commits == 1
    assert db.items[-1].event_type == "PERFORMANCE_ROLE_UPDATED"


@pytest.mark.asyncio
async def test_role_deactivation_and_deletion_write_audits_in_one_transaction():
    db = _FakeRoleDb()
    db.role = _role(active=True)
    result = await update_performance_role_status(8, PerformanceRoleStatusIn(is_active=False), _context(), db)
    assert result.is_active is False
    assert db.commits == 1
    assert db.items[-1].event_type == "PERFORMANCE_ROLE_DEACTIVATED"

    await delete_performance_role(8, _context(), db)
    assert db.deleted is db.role
    assert db.commits == 2
    assert db.items[-1].event_type == "PERFORMANCE_ROLE_DELETED"
    assert db.items[-1].before_state["name"] == "自定义角色"


@pytest.mark.asyncio
async def test_status_change_rejects_system_roles():
    db = _FakeRoleDb()
    db.role = _role(active=True, system=True)
    with pytest.raises(HTTPException) as error:
        await update_performance_role_status(8, PerformanceRoleStatusIn(is_active=False), _context(), db)
    assert error.value.status_code == 400
    assert error.value.detail == "系统角色不可停用"
    assert db.commits == 0


@pytest.mark.asyncio
async def test_status_change_allows_custom_assessment_roles():
    db = _FakeRoleDb()
    db.role = _role(active=True, role_type="ASSESSMENT")
    result = await update_performance_role_status(8, PerformanceRoleStatusIn(is_active=False), _context(), db)
    assert result.is_active is False
    assert db.commits == 1
    assert db.items[-1].event_type == "PERFORMANCE_ROLE_DEACTIVATED"


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("role", "message"),
    [
        (_role(active=True), "需要先停用角色"),
        (_role(system=True), "系统角色不可删除"),
    ],
)
async def test_delete_role_rejects_active_and_system_roles(role, message):
    db = _FakeRoleDb()
    db.role = role
    with pytest.raises(HTTPException) as error:
        await delete_performance_role(8, _context(), db)
    assert error.value.status_code == 400
    assert message in error.value.detail
    assert db.deleted is None
    assert db.commits == 0


@pytest.mark.asyncio
async def test_delete_allows_inactive_custom_assessment_roles():
    db = _FakeRoleDb()
    db.role = _role(active=False, role_type="ASSESSMENT")
    await delete_performance_role(8, _context(), db)
    assert db.deleted is db.role
    assert db.commits == 1
    assert db.items[-1].event_type == "PERFORMANCE_ROLE_DELETED"


@pytest.mark.asyncio
async def test_delete_role_rejects_existing_assignments_and_missing_role():
    db = _FakeRoleDb()
    db.role = _role()
    db.execute = lambda _statement: _async_value(33)
    with pytest.raises(HTTPException) as error:
        await delete_performance_role(8, _context(), db)
    assert error.value.status_code == 409
    assert db.deleted is None

    db.role = None
    with pytest.raises(HTTPException) as error:
        await delete_performance_role(8, _context(), db)
    assert error.value.status_code == 404


@pytest.mark.asyncio
async def test_role_mutations_require_performance_authorization_permission():
    permission_dependency = role_permission_context.__defaults__[0].dependency
    with pytest.raises(HTTPException) as error:
        await permission_dependency(_context_without_permission())
    assert error.value.status_code == 403
    assert await permission_dependency(_context()) == _context()


def _context_without_permission():
    return PerformanceAccessContext(
        subject_type="SYSTEM_ACCOUNT", subject_id=2, display_name="普通账号",
        account_type="PERFORMANCE_ADMIN", portal_entry_permissions=("performance.admin",),
        role_grants=(), permission_codes=(),
    )


async def _async_value(value):
    return _FakeResult(value)
