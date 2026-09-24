import asyncio

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from pydantic import ValidationError
from sqlalchemy.sql.dml import Insert

from app.core.db import get_session
from app.performance import assessment_method_settings_router
from app.performance.auth_context import PerformanceAccessContext
from app.performance.assessment_method_settings_router import (
    AssessmentMethodSettingsPatch,
    _defaults,
    get_assessment_method_settings,
    update_assessment_method_settings,
)
from app.performance.models import PerformanceAssessmentMethodSetting


class MemoryAssessmentMethodDb:
    def __init__(self):
        self.setting = None
        self.commits = 0

    async def get(self, *_args):
        return self.setting

    async def execute(self, statement):
        if isinstance(statement, Insert) and self.setting is None:
            self.setting = PerformanceAssessmentMethodSetting(id=1, **_defaults().model_dump())
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
    app.include_router(assessment_method_settings_router.router, prefix="/api/v1")
    app.dependency_overrides[get_session] = lambda: db or MemoryAssessmentMethodDb()
    if allowed:
        app.dependency_overrides[assessment_method_settings_router._context] = _context
    else:
        async def deny():
            raise HTTPException(status_code=403, detail="forbidden")

        app.dependency_overrides[assessment_method_settings_router._context] = deny
    return TestClient(app)


def test_get_returns_disabled_by_default_without_writing():
    db = MemoryAssessmentMethodDb()

    response = _client(allowed=True, db=db).get("/api/v1/performance/system-settings/assessment-method")

    assert response.status_code == 200
    assert response.json() == {"metric_assessment_enabled": False}
    assert db.setting is None
    assert db.commits == 0


def test_get_and_patch_require_configuration_permission():
    client = _client(allowed=False)

    assert client.get("/api/v1/performance/system-settings/assessment-method").status_code == 403
    assert client.patch(
        "/api/v1/performance/system-settings/assessment-method",
        json={"metric_assessment_enabled": True},
    ).status_code == 403


def test_patch_validates_payload_and_persists_state(monkeypatch):
    db = MemoryAssessmentMethodDb()
    events = []

    class Audit:
        def __init__(self, _db):
            pass

        def append_event(self, event):
            events.append(event)

    monkeypatch.setattr(assessment_method_settings_router, "PerformanceAuditService", Audit)
    response = _client(allowed=True, db=db).patch(
        "/api/v1/performance/system-settings/assessment-method",
        json={"metric_assessment_enabled": True},
    )

    assert response.status_code == 200
    assert response.json() == {"metric_assessment_enabled": True}
    assert db.commits == 1
    assert events[0].event_type == "PERFORMANCE_ASSESSMENT_METHOD_SETTING_UPDATED"
    assert events[0].before_state == {"metric_assessment_enabled": False}
    assert events[0].after_state == {"metric_assessment_enabled": True}
    assert _client(allowed=True, db=db).get(
        "/api/v1/performance/system-settings/assessment-method"
    ).json() == {"metric_assessment_enabled": True}


def test_patch_rejects_unknown_or_missing_fields():
    for values in ({"unknown": True}, {}, {"metric_assessment_enabled": None}):
        with pytest.raises(ValidationError):
            AssessmentMethodSettingsPatch(**values)

    client = _client(allowed=True)
    assert client.patch(
        "/api/v1/performance/system-settings/assessment-method",
        json={"unknown": True},
    ).status_code == 422
    assert client.patch(
        "/api/v1/performance/system-settings/assessment-method",
        json={},
    ).status_code == 422
