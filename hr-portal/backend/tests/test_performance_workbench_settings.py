from datetime import UTC, datetime
from types import SimpleNamespace

import pytest
from pydantic import ValidationError

from app.performance.workbench_settings_router import (
    WorkbenchAnnouncementCreate,
    WorkbenchEntryCreate,
    WorkbenchEntryPatch,
    _announcement_or_404,
    _entry_or_404,
    get_workbench_announcement_feed,
)


def test_workbench_setting_payloads_trim_and_reject_unknown_fields():
    entry = WorkbenchEntryCreate(title=" 入口 ", link=" https://example.com ", icon=" ")
    announcement = WorkbenchAnnouncementCreate(title=" 公告 ", link=" /notice ")

    assert entry.title == "入口"
    assert entry.link == "https://example.com"
    assert entry.icon is None
    assert entry.visibility == "所有人"
    assert announcement.title == "公告"
    assert announcement.cycle_label == "所有周期"
    assert announcement.require_ack is False

    with pytest.raises(ValidationError):
        WorkbenchEntryCreate(title=" ", link="/entry")
    with pytest.raises(ValidationError):
        WorkbenchEntryCreate(title="入口", link="/entry", unknown="value")
    with pytest.raises(ValidationError):
        WorkbenchEntryPatch(title=" ")


@pytest.mark.asyncio
async def test_workbench_setting_missing_resources_return_stable_error():
    class Db:
        async def get(self, *_args):
            return None

    with pytest.raises(Exception) as entry_error:
        await _entry_or_404(Db(), 10)  # type: ignore[arg-type]
    with pytest.raises(Exception) as announcement_error:
        await _announcement_or_404(Db(), 11)  # type: ignore[arg-type]

    assert entry_error.value.status_code == 404
    assert entry_error.value.detail == "WORKBENCH_SETTING_NOT_FOUND"
    assert announcement_error.value.status_code == 404
    assert announcement_error.value.detail == "WORKBENCH_SETTING_NOT_FOUND"


def test_workbench_setting_models_have_expected_defaults():
    now = datetime.now(UTC)
    item = SimpleNamespace(
        id=1,
        title="入口",
        status="active",
        link="/entry",
        icon=None,
        visibility="所有人",
        display_order=0,
        created_at=now,
        updated_at=now,
    )


@pytest.mark.asyncio
async def test_workbench_announcement_feed_honors_global_switch():
    class Db:
        async def get(self, *_args):
            return SimpleNamespace(announcement_enabled=False)

        async def execute(self, *_args):
            raise AssertionError("disabled feed should not query announcements")

    result = await get_workbench_announcement_feed(cycle_ref=None, context=SimpleNamespace(), db=Db())

    assert result.announcement_enabled is False
    assert result.items == []


@pytest.mark.asyncio
async def test_workbench_announcement_feed_returns_configured_global_announcement():
    now = datetime.now(UTC)
    announcement = SimpleNamespace(
        id=7,
        title="绩效面谈指引",
        link="/performance/review",
        cycle_label="所有周期",
        require_ack=False,
        display_order=0,
        updated_at=now,
    )

    class Result:
        def scalars(self):
            return SimpleNamespace(all=lambda: [announcement])

    class Db:
        async def get(self, *_args):
            return None

        async def execute(self, statement):
            sql = str(statement.compile(compile_kwargs={"literal_binds": True}))
            assert "performance_workbench_announcements.status = 'active'" in sql
            assert "performance_workbench_announcements.cycle_ref IS NULL" in sql
            return Result()

    result = await get_workbench_announcement_feed(cycle_ref=None, context=SimpleNamespace(), db=Db())

    assert result.announcement_enabled is True
    assert result.items[0].title == "绩效面谈指引"
    assert result.items[0].link == "/performance/review"
