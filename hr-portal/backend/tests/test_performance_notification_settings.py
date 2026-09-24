import asyncio

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from pydantic import ValidationError
from sqlalchemy.sql.dml import Insert

from app.core.db import get_session
from app.performance import notification_settings_router
from app.performance.auth_context import PerformanceAccessContext
from app.performance.models import PerformanceNotificationSetting
from app.performance.notification_settings_router import (
    NotificationSettingsPatch,
    _defaults,
    get_notification_settings,
    update_notification_settings,
)


class MemoryNotificationDb:
    def __init__(self):
        self.setting = None
        self.commits = 0

    async def get(self, *_args):
        return self.setting

    async def execute(self, statement):
        if isinstance(statement, Insert) and self.setting is None:
            self.setting = PerformanceNotificationSetting(id=1, **_defaults().model_dump())
        return self

    def scalar_one(self):
        return self.setting

    async def commit(self):
        self.commits += 1

    async def refresh(self, _setting):
        pass


def _context() -> PerformanceAccessContext:
    return PerformanceAccessContext(
        subject_type="SYSTEM_ACCOUNT",
        subject_id=1,
        display_name="绩效管理员",
        account_type="PERFORMANCE_SUPER_ADMIN",
        portal_entry_permissions=("performance.admin",),
        role_grants=(),
        permission_codes=("performance.configuration.manage",),
    )


def _client(*, allowed: bool, db=None) -> TestClient:
    app = FastAPI()
    app.include_router(notification_settings_router.router, prefix="/api/v1")
    app.dependency_overrides[get_session] = lambda: db or MemoryNotificationDb()
    if allowed:
        app.dependency_overrides[notification_settings_router._context] = _context
    else:
        async def deny():
            raise HTTPException(status_code=403, detail="forbidden")

        app.dependency_overrides[notification_settings_router._context] = deny
    return TestClient(app)


def test_notification_get_returns_capture_defaults_without_writing():
    db = MemoryNotificationDb()
    response = _client(allowed=True, db=db).get("/api/v1/performance/system-settings/notifications")

    assert response.status_code == 200
    assert response.json() == _defaults().model_dump()
    assert db.setting is None
    assert db.commits == 0


def test_notification_get_and_patch_require_configuration_permission():
    client = _client(allowed=False)

    assert client.get("/api/v1/performance/system-settings/notifications").status_code == 403
    assert client.patch(
        "/api/v1/performance/system-settings/notifications",
        json={"calibration_delivery_mode": "after_calibration"},
    ).status_code == 403


def test_notification_patch_rejects_invalid_fields_and_null():
    for values in (
        {"feishu_push_enabled": False},
        {"unknown": False},
        {"calibration_delivery_mode": "invalid"},
        {"result_change_notification_scope": "invalid"},
        {"progress_daily_notification_enabled": None},
    ):
        with pytest.raises(ValidationError):
            NotificationSettingsPatch(**values)


def test_each_policy_patch_persists_without_overwriting_others(monkeypatch):
    db = MemoryNotificationDb()
    events = []

    class Audit:
        def __init__(self, _db):
            pass

        def append_event(self, event):
            events.append(event)

    monkeypatch.setattr(notification_settings_router, "PerformanceAuditService", Audit)
    patches = (
        {"calibration_delivery_mode": "after_calibration"},
        {"result_change_notification_scope": "any_content"},
        {"todo_task_notification_enabled": False},
        {"progress_daily_notification_enabled": False},
        {"stage_start_notification_enabled": False},
        {"email_enabled": True},
    )
    for patch in patches:
        asyncio.run(update_notification_settings(NotificationSettingsPatch(**patch), _context(), db))

    reopened = asyncio.run(get_notification_settings(_context(), db))
    for patch in patches:
        for field, value in patch.items():
            assert getattr(reopened, field) == value
    assert reopened.feishu_push_enabled is True
    assert db.commits == len(patches)
    assert len(events) == len(patches)
    assert events[0].before_state["calibration_delivery_mode"] == "realtime"
    assert events[-1].after_state["email_enabled"] is True
    assert all(event.event_type == "PERFORMANCE_NOTIFICATION_SETTING_UPDATED" for event in events)

    asyncio.run(update_notification_settings(NotificationSettingsPatch(email_enabled=True), _context(), db))
    assert len(events) == len(patches)


def test_patch_http_returns_persisted_state_and_validates_unknown_fields(monkeypatch):
    db = MemoryNotificationDb()

    class Audit:
        def __init__(self, _db):
            pass

        def append_event(self, _event):
            pass

    monkeypatch.setattr(notification_settings_router, "PerformanceAuditService", Audit)
    client = _client(allowed=True, db=db)
    response = client.patch(
        "/api/v1/performance/system-settings/notifications",
        json={"stage_start_notification_enabled": False},
    )
    assert response.status_code == 200
    assert response.json()["stage_start_notification_enabled"] is False
    assert client.get("/api/v1/performance/system-settings/notifications").json()["stage_start_notification_enabled"] is False
    assert client.patch("/api/v1/performance/system-settings/notifications", json={"unexpected": True}).status_code == 422
    assert client.patch("/api/v1/performance/system-settings/notifications", json={"todo_task_notification_enabled": None}).status_code == 422
