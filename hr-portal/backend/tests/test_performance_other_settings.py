import asyncio
import importlib.util
from pathlib import Path
from uuid import uuid4

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.sql.dml import Insert

from app.core.db import get_session
from app.performance import other_settings_router as module
from app.performance.auth_context import PerformanceAccessContext, get_performance_access_context
from app.performance.models import PerformanceOtherSetting

URL = "/api/v1/performance/system-settings/other"


class MemoryDb:
    def __init__(self):
        self.setting = None
        self.commits = 0

    async def get(self, *_args):
        return self.setting

    async def execute(self, statement):
        if isinstance(statement, Insert) and self.setting is None:
            self.setting = PerformanceOtherSetting(id=1, reviewer_360_tags=[], reviewer_360_tags_version=0, **module.OtherSettingsOut().model_dump())
        return self

    def scalar_one(self):
        return self.setting

    async def commit(self):
        self.commits += 1

    async def refresh(self, _setting):
        pass


def context(allowed=True):
    return PerformanceAccessContext(
        subject_type="SYSTEM_ACCOUNT", subject_id=1, display_name="配置管理员",
        account_type="PERFORMANCE_ADMIN", portal_entry_permissions=(), role_grants=(),
        permission_codes=("performance.configuration.manage",) if allowed else (),
    )


def client(db, allowed=True, authenticated=True):
    app = FastAPI()
    app.include_router(module.router, prefix="/api/v1")
    app.dependency_overrides[get_session] = lambda: db
    if authenticated:
        app.dependency_overrides[get_performance_access_context] = lambda: context(allowed)
    return TestClient(app)


@pytest.fixture
def events(monkeypatch):
    result = []

    class Audit:
        def __init__(self, _db):
            pass

        def append_event(self, event):
            result.append(event)

    async def actor(_db, _context):
        from app.performance.auth_context import TrustedPerformanceActor
        return TrustedPerformanceActor(actor_type="SYSTEM_ACCOUNT", actor_ref="1")

    monkeypatch.setattr(module, "PerformanceAuditService", Audit)
    monkeypatch.setattr(module, "resolve_trusted_performance_actor", actor)
    return result


def test_get_defaults_does_not_write():
    db = MemoryDb()
    response = client(db).get(URL)
    assert response.status_code == 200
    assert response.json() == module.OtherSettingsOut().model_dump()
    assert db.setting is None
    assert db.commits == 0


@pytest.mark.parametrize("authenticated,allowed,status", [(False, False, 401), (True, False, 403)])
def test_real_permission_dependency_rejects_get_and_patch(authenticated, allowed, status):
    api = client(MemoryDb(), allowed=allowed, authenticated=authenticated)
    assert api.get(URL).status_code == status
    assert api.patch(URL, json={"calibration_import_enabled": False}).status_code == status


@pytest.mark.parametrize("values", [{}, {"unknown": True}, {"actor_ref": "1"},
    {"calibration_import_enabled": None}, {"calibration_import_enabled": "false"},
    {"calibration_import_enabled": 0}, {"calibration_import_enabled": []}])
def test_patch_validation_rejects_invalid_inputs(values):
    db = MemoryDb()
    assert client(db).patch(URL, json=values).status_code == 422
    assert db.setting is None
    assert db.commits == 0


def test_each_field_round_trips_and_noop_does_not_audit(events):
    db = MemoryDb()
    api = client(db)
    expected = module.OtherSettingsOut().model_dump()
    for key in expected:
        if not isinstance(expected[key], bool):
            continue
        expected[key] = not expected[key]
        response = api.patch(URL, json={key: expected[key]})
        assert response.status_code == 200
        assert response.json() == expected
        assert api.get(URL).json() == expected
    assert len(events) == 8
    assert all(event.event_type == "PERFORMANCE_OTHER_SETTING_UPDATED" for event in events)
    assert all(event.subject_type == "OTHER_SETTINGS" and event.actor_ref == "1" for event in events)
    assert events[0].before_state == module.OtherSettingsOut().model_dump()
    assert events[-1].after_state == expected
    assert api.patch(URL, json=expected).status_code == 200
    assert len(events) == 8
    assert db.setting.updated_by_type == "SYSTEM_ACCOUNT"


def test_settings_model_has_matching_nonnull_server_defaults():
    defaults = module.OtherSettingsOut().model_dump()
    for key, value in defaults.items():
        column = PerformanceOtherSetting.__table__.c[key]
        assert column.nullable is False
        assert column.default.arg == value
        assert str(column.server_default.arg) == (str(value).lower() if isinstance(value, bool) else value)


def test_bilingual_prompts_persist_and_blank_restores_defaults(events):
    api = client(MemoryDb())
    payload = {"authorization_prompt_zh": "  自定义\n授权提示  ", "authorization_prompt_en": "Custom\nnotice"}
    response = api.patch(URL, json=payload)
    assert response.status_code == 200
    assert all(response.json()[key] == value for key, value in payload.items())
    assert api.get(URL).json() == response.json()
    assert api.patch(URL, json={"calibration_import_enabled": False}).json()["authorization_prompt_en"] == payload["authorization_prompt_en"]
    assert api.patch(URL, json=payload).status_code == 200
    assert len(events) == 2
    reset = api.patch(URL, json={"authorization_prompt_zh": " \n\t ", "authorization_prompt_en": ""})
    assert reset.status_code == 200
    for key in payload:
        assert reset.json()[key] == getattr(module.OtherSettingsOut(), key)
    assert reset.json()["calibration_import_enabled"] is False
    assert len(events) == 3
    assert events[-1].before_state["authorization_prompt_zh"] == payload["authorization_prompt_zh"]


def test_transfer_prompts_save_independently_and_blank_restores_defaults(events):
    api = client(MemoryDb())
    initial = api.get(URL).json()
    authorization = {"authorization_prompt_zh": "授权独立", "authorization_prompt_en": "Authorized independently"}
    assert api.patch(URL, json=authorization).status_code == 200
    transfer = {"transfer_prompt_zh": "  转交说明\n第二行  ", "transfer_prompt_en": "Transfer notice"}
    response = api.patch(URL, json=transfer)
    assert response.status_code == 200
    assert all(response.json()[key] == value for key, value in transfer.items())
    assert all(response.json()[key] == value for key, value in authorization.items())
    assert api.get(URL).json() == response.json()
    assert api.patch(URL, json=transfer).status_code == 200
    assert len(events) == 2
    restored = api.patch(URL, json={"transfer_prompt_zh": "\t\n ", "transfer_prompt_en": ""})
    assert restored.status_code == 200
    assert all(restored.json()[key] == initial[key] for key in transfer)
    assert all(restored.json()[key] == authorization[key] for key in authorization)
    assert len(events) == 3
    assert events[-1].before_state["transfer_prompt_zh"] == transfer["transfer_prompt_zh"]
    assert events[-1].after_state["authorization_prompt_zh"] == authorization["authorization_prompt_zh"]


@pytest.mark.parametrize("key", ["authorization_prompt_zh", "authorization_prompt_en", "transfer_prompt_zh", "transfer_prompt_en"])
@pytest.mark.parametrize("value", [None, 1, False, [], {}, "a" * 1001, "😀" * 1001])
def test_prompt_validation_does_not_write(key, value):
    db = MemoryDb()
    assert client(db).patch(URL, json={key: value}).status_code == 422
    assert db.setting is None
    assert db.commits == 0


@pytest.mark.parametrize("value", ["字" * 1000, "😀" * 1000])
def test_prompt_accepts_1000_unicode_characters(events, value):
    api = client(MemoryDb())
    response = api.patch(URL, json={"authorization_prompt_zh": value, "authorization_prompt_en": value, "transfer_prompt_zh": value, "transfer_prompt_en": value})
    assert response.status_code == 200
    for key in ("authorization_prompt_zh", "authorization_prompt_en", "transfer_prompt_zh", "transfer_prompt_en"):
        assert response.json()[key] == value


TAGS_URL = URL + "/reviewer-360-tags"


def tag(name="同事", **values):
    return {"id": str(uuid4()), "name_zh": name, **values}


def test_tags_empty_get_does_not_write():
    db = MemoryDb()
    assert client(db).get(TAGS_URL).json() == {"tags": [], "version": 0}
    assert db.setting is None
    assert db.commits == 0


@pytest.mark.parametrize("authenticated,allowed,status", [(False, False, 401), (True, False, 403)])
def test_tags_permission_dependency(authenticated, allowed, status):
    api = client(MemoryDb(), allowed=allowed, authenticated=authenticated)
    assert api.get(TAGS_URL).status_code == status
    assert api.put(TAGS_URL, json={"tags": [], "version": 0}).status_code == status


@pytest.mark.parametrize("version", [None, True, False, 0.0, 1.5, "0", -1, [], {}])
def test_tags_reject_invalid_version(version):
    db = MemoryDb()
    assert client(db).put(TAGS_URL, json={"tags": [], "version": version}).status_code == 422
    assert db.setting is None


@pytest.mark.parametrize("payload", [{}, {"tags": []}, {"version": 0}, {"tags": None, "version": 0},
    {"tags": {}, "version": 0}, {"tags": [None], "version": 0},
    {"tags": [], "version": 0, "actor_ref": "spoof"}])
def test_tags_reject_invalid_payload(payload):
    db = MemoryDb()
    assert client(db).put(TAGS_URL, json=payload).status_code == 422
    assert db.setting is None


@pytest.mark.parametrize("values", [
    {"id": None}, {"id": 123}, {"id": False}, {"id": "not-uuid"},
    {"name_zh": "  \n "}, {"name_zh": None}, {"name_zh": 1}, {"name_zh": "😀" * 101},
    {"name_en": None}, {"name_en": False}, {"name_en": "😀" * 101},
    {"description_zh": None}, {"description_zh": []}, {"description_zh": "😀" * 501},
    {"description_en": None}, {"description_en": {}}, {"description_en": "😀" * 501},
    {"unknown": "value"},
])
def test_tags_reject_invalid_tag(values):
    db = MemoryDb()
    assert client(db).put(TAGS_URL, json={"tags": [tag(**values)], "version": 0}).status_code == 422
    assert db.setting is None
    assert db.commits == 0


@pytest.mark.parametrize("field", ["id", "name_zh", "name_en", "description_zh", "description_en"])
@pytest.mark.parametrize("value", [None, 12, True, [], {}])
def test_tags_text_fields_are_strict(field, value):
    db = MemoryDb()
    assert client(db).put(TAGS_URL, json={"tags": [tag(**{field: value})], "version": 0}).status_code == 422
    assert db.setting is None


def test_tags_require_id_and_chinese_name():
    api = client(MemoryDb())
    for value in ({"id": str(uuid4())}, {"name_zh": "同事"}):
        assert api.put(TAGS_URL, json={"tags": [value], "version": 0}).status_code == 422


@pytest.mark.parametrize("language", ["name_zh", "name_en"])
def test_tags_names_casefold_duplicates(language):
    values = [tag("甲", **{language: " Straße "}), tag("乙", **{language: "STRASSE"})]
    assert client(MemoryDb()).put(TAGS_URL, json={"tags": values, "version": 0}).status_code == 422


def test_tags_uuid_normalization_rejects_duplicate():
    uid = uuid4()
    values = [tag("甲", id=str(uid).upper()), tag("乙", id=uid.hex)]
    assert client(MemoryDb()).put(TAGS_URL, json={"tags": values, "version": 0}).status_code == 422


def test_tags_unicode_boundaries_count_limit_and_description_preservation(events):
    api = client(MemoryDb())
    values = [tag("😀" * 100, name_en=" " + "😀" * 100 + " ",
                  description_zh="😀" * 500, description_en=" \n原始空白\n ")]
    response = api.put(TAGS_URL, json={"tags": values, "version": 0})
    assert response.status_code == 200
    assert response.json()["tags"][0]["name_en"] == "😀" * 100
    assert response.json()["tags"][0]["description_en"] == " \n原始空白\n "
    fifty = [tag(str(index)) for index in range(50)]
    assert api.put(TAGS_URL, json={"tags": fifty, "version": 1}).status_code == 200
    assert api.put(TAGS_URL, json={"tags": fifty + [tag("51")], "version": 2}).status_code == 422


def test_tags_save_read_reorder_rename_clear_noop_conflict_and_siblings(events):
    db = MemoryDb()
    api = client(db)
    assert api.put(TAGS_URL, json={"tags": [], "version": 0}).json() == {"tags": [], "version": 0}
    assert events == []
    assert api.patch(URL, json={"calibration_import_enabled": False, "authorization_prompt_zh": "自定义授权", "transfer_prompt_en": "Custom transfer"}).status_code == 200
    sibling = api.get(URL).json()
    first = tag("  同事  ", id=str(uuid4()).upper())
    second = tag("上级", name_en="Manager")
    saved = api.put(TAGS_URL, json={"tags": [first, second], "version": 0})
    assert saved.status_code == 200
    current = saved.json()
    assert current["version"] == 1
    assert current["tags"][0]["id"] == first["id"].lower()
    assert current["tags"][0]["name_zh"] == "同事"
    assert current["tags"][0]["description_zh"] == ""
    assert api.get(TAGS_URL).json() == current
    count = len(events)
    assert api.put(TAGS_URL, json=current).json() == current
    assert len(events) == count
    conflict = api.put(TAGS_URL, json={"tags": [], "version": 0})
    assert conflict.status_code == 409
    assert "关闭" in conflict.json()["detail"] and "重新打开" in conflict.json()["detail"]
    assert api.get(TAGS_URL).json() == current
    reordered = current["tags"][::-1]
    current = api.put(TAGS_URL, json={"tags": reordered, "version": 1}).json()
    assert current == {"tags": reordered, "version": 2}
    renamed = [dict(value) for value in current["tags"]]
    renamed[0]["name_zh"] = "直属上级"
    current = api.put(TAGS_URL, json={"tags": renamed, "version": 2}).json()
    assert current == {"tags": renamed, "version": 3}
    assert api.get(URL).json() == sibling
    assert "reviewer_360_tags" not in sibling and "reviewer_360_tags_version" not in sibling
    assert api.patch(URL, json={"reviewer_360_tags": []}).status_code == 422
    assert api.patch(URL, json={"authorization_prompt_en": "Notice", "reviewer_360_tags_enabled": False}).status_code == 200
    assert api.get(TAGS_URL).json() == current
    assert api.put(TAGS_URL, json={"tags": [], "version": 3}).json() == {"tags": [], "version": 4}
    assert api.get(TAGS_URL).json() == {"tags": [], "version": 4}
    audit = [event for event in events if event.event_type == "PERFORMANCE_REVIEWER_360_TAGS_UPDATED"]
    assert len(audit) == 4
    assert audit[0].before_state == {"tags": [], "version": 0}
    assert audit[-1].after_state == {"tags": [], "version": 4}
    assert all(event.subject_type == "OTHER_SETTINGS" and event.subject_ref == "1" and event.actor_type == "SYSTEM_ACCOUNT" and event.actor_ref == "1" for event in audit)


def test_tags_model_defaults():
    columns = PerformanceOtherSetting.__table__.c
    assert not columns.reviewer_360_tags.nullable
    assert columns.reviewer_360_tags.default.arg(None) == []
    assert str(columns.reviewer_360_tags.server_default.arg) == "[]"
    assert not columns.reviewer_360_tags_version.nullable
    assert columns.reviewer_360_tags_version.default.arg == 0
    assert str(columns.reviewer_360_tags_version.server_default.arg) == "0"


@pytest.mark.postgres_acceptance
def test_postgres_migration_roundtrip_persistence_concurrency_and_audit_rollback():
    from alembic.migration import MigrationContext
    from alembic.operations import Operations
    from sqlalchemy import select, text
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
    from sqlalchemy.pool import NullPool

    from app.core.config import settings
    from app.performance.models import PerformanceAuditEvent

    path = Path(__file__).resolve().parents[1] / "alembic/versions/0260_performance_other_settings.py"
    spec = importlib.util.spec_from_file_location("other_settings_migration", path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    prompt_path = path.with_name("0262_performance_authorization_prompts.py")
    prompt_spec = importlib.util.spec_from_file_location("authorization_prompts_migration", prompt_path)
    prompt_migration = importlib.util.module_from_spec(prompt_spec)
    prompt_spec.loader.exec_module(prompt_migration)
    transfer_path = path.with_name("0264_performance_transfer_prompts.py")
    transfer_spec = importlib.util.spec_from_file_location("transfer_prompts_migration", transfer_path)
    transfer_migration = importlib.util.module_from_spec(transfer_spec)
    transfer_spec.loader.exec_module(transfer_migration)
    tags_path = path.with_name("0265_performance_reviewer_360_tags.py")
    tags_spec = importlib.util.spec_from_file_location("reviewer_360_tags_migration", tags_path)
    tags_migration = importlib.util.module_from_spec(tags_spec)
    tags_spec.loader.exec_module(tags_migration)
    schema = "pm_other_acceptance_" + uuid4().hex[:12]
    engine = create_async_engine(settings.db_url_async, poolclass=NullPool)

    async def run():
        async with engine.begin() as conn:
            await conn.execute(text(f'CREATE SCHEMA "{schema}"'))
        scoped = create_async_engine(
            settings.db_url_async, poolclass=NullPool,
            connect_args={"server_settings": {"search_path": schema}},
        )
        factory = async_sessionmaker(scoped, expire_on_commit=False)

        def migrate(conn, action):
            with Operations.context(MigrationContext.configure(conn)):
                if action == "upgrade":
                    migration.upgrade()
                    prompt_migration.upgrade()
                    transfer_migration.upgrade()
                    tags_migration.upgrade()
                else:
                    tags_migration.downgrade()
                    transfer_migration.downgrade()
                    prompt_migration.downgrade()
                    migration.downgrade()

        try:
            async with scoped.begin() as conn:
                await conn.run_sync(lambda c: migrate(c, "upgrade"))
                await conn.run_sync(lambda c: PerformanceAuditEvent.__table__.create(c))
                await conn.execute(text("CREATE TABLE preserved_record (id integer primary key)"))
                await conn.execute(text("INSERT INTO preserved_record VALUES (1)"))
            async with factory() as db:
                assert (await module.get_other_settings(context(), db)).model_dump() == module.OtherSettingsOut().model_dump()
                assert await db.get(PerformanceOtherSetting, 1) is None

            async def patch(values):
                async with factory() as db:
                    return await module.update_other_settings(module.OtherSettingsPatch(**values), context(), db)

            await asyncio.gather(
                patch({"calibration_import_enabled": False}),
                patch({"performance_coefficient_enabled": True}),
            )
            async with factory() as db:
                value = await module.get_other_settings(context(), db)
                assert value.calibration_import_enabled is False
                assert value.performance_coefficient_enabled is True
                assert value.manual_result_opening_enabled is True
                assert len((await db.execute(select(PerformanceAuditEvent))).scalars().all()) == 2
            await patch({"calibration_import_enabled": False})
            async with factory() as db:
                assert len((await db.execute(select(PerformanceAuditEvent))).scalars().all()) == 2
            for key, value in module.OtherSettingsOut().model_dump().items():
                if not isinstance(value, bool):
                    continue
                await patch({key: not value})
                async with factory() as db:
                    assert getattr(await module.get_other_settings(context(), db), key) is not value

            await asyncio.gather(
                patch({"authorization_prompt_zh": "授权提示\n已保存"}),
                patch({"authorization_prompt_en": "Saved notice"}),
                patch({"manual_result_opening_enabled": False}),
            )
            async with factory() as db:
                saved = await module.get_other_settings(context(), db)
                assert saved.authorization_prompt_zh == "授权提示\n已保存"
                assert saved.authorization_prompt_en == "Saved notice"
                assert saved.manual_result_opening_enabled is False
            await asyncio.gather(
                patch({"transfer_prompt_zh": "转交保存\n第二行"}),
                patch({"transfer_prompt_en": "Saved transfer notice"}),
                patch({"authorization_prompt_zh": "独立授权"}),
            )
            async with factory() as db:
                both = await module.get_other_settings(context(), db)
                assert both.transfer_prompt_zh == "转交保存\n第二行"
                assert both.transfer_prompt_en == "Saved transfer notice"
                assert both.authorization_prompt_zh == "独立授权"
                assert both.calibration_import_enabled is False
            async with scoped.begin() as conn:
                def transfer_step(connection, action):
                    with Operations.context(MigrationContext.configure(connection)):
                        getattr(transfer_migration, action)()
                await conn.run_sync(lambda c: transfer_step(c, "downgrade"))
                assert (await conn.execute(text("SELECT authorization_prompt_zh FROM performance_other_settings WHERE id=1"))).scalar_one() == "独立授权"
                await conn.run_sync(lambda c: transfer_step(c, "upgrade"))
            async with factory() as db:
                restored_transfer = await module.get_other_settings(context(), db)
                assert restored_transfer.transfer_prompt_zh == module.OtherSettingsOut().transfer_prompt_zh
                assert restored_transfer.transfer_prompt_en == module.OtherSettingsOut().transfer_prompt_en
                assert restored_transfer.authorization_prompt_zh == "独立授权"

            async def put_tags(values, version):
                async with factory() as db:
                    return await module.update_reviewer_360_tags(module.Reviewer360TagsPayload(tags=values, version=version), context(), db)

            async with factory() as db:
                assert (await module.get_reviewer_360_tags(context(), db)).model_dump() == {"tags": [], "version": 0}
            old_settings = restored_transfer.model_dump()
            async with scoped.begin() as conn:
                def tags_step(connection, action):
                    with Operations.context(MigrationContext.configure(connection)):
                        getattr(tags_migration, action)()
                await conn.run_sync(lambda c: tags_step(c, "downgrade"))
                assert (await conn.execute(text("SELECT authorization_prompt_zh FROM performance_other_settings WHERE id=1"))).scalar_one() == old_settings["authorization_prompt_zh"]
                await conn.run_sync(lambda c: tags_step(c, "upgrade"))
            async with factory() as db:
                assert (await module.get_reviewer_360_tags(context(), db)).model_dump() == {"tags": [], "version": 0}
                assert (await module.get_other_settings(context(), db)).model_dump() == old_settings

            from fastapi import HTTPException
            concurrent = await asyncio.gather(put_tags([tag("同事")], 0), put_tags([tag("上级")], 0), return_exceptions=True)
            assert sum(isinstance(value, module.Reviewer360TagsOut) for value in concurrent) == 1
            rejected = [value for value in concurrent if isinstance(value, HTTPException)]
            assert len(rejected) == 1 and rejected[0].status_code == 409
            async with factory() as db:
                current_tags = (await module.get_reviewer_360_tags(context(), db)).model_dump()
                tag_audits = (await db.execute(select(PerformanceAuditEvent).where(PerformanceAuditEvent.event_type == "PERFORMANCE_REVIEWER_360_TAGS_UPDATED"))).scalars().all()
                assert len(tag_audits) == 1
                assert tag_audits[0].before_state == {"tags": [], "version": 0}
                assert tag_audits[0].after_state == current_tags
                assert tag_audits[0].subject_type == "OTHER_SETTINGS" and tag_audits[0].subject_ref == "1"
                assert tag_audits[0].actor_type == "SYSTEM_ACCOUNT" and tag_audits[0].actor_ref == "1"
            await put_tags(current_tags["tags"], 1)
            async with factory() as db:
                assert len((await db.execute(select(PerformanceAuditEvent).where(PerformanceAuditEvent.event_type == "PERFORMANCE_REVIEWER_360_TAGS_UPDATED"))).scalars().all()) == 1
            await asyncio.gather(
                put_tags([tag("并发目录")], 1),
                patch({"transfer_prompt_zh": "并发转交提示", "calibration_import_enabled": False}),
            )
            async with factory() as db:
                before_failure = (await module.get_reviewer_360_tags(context(), db)).model_dump()
                assert before_failure["version"] == 2
                assert before_failure["tags"][0]["name_zh"] == "并发目录"
                assert (await module.get_other_settings(context(), db)).transfer_prompt_zh == "并发转交提示"
            async with scoped.begin() as conn:
                await conn.execute(text("ALTER TABLE performance_audit_events ADD CONSTRAINT reject_tags_audit CHECK (event_type <> 'PERFORMANCE_REVIEWER_360_TAGS_UPDATED') NOT VALID"))
            from sqlalchemy.exc import IntegrityError
            with pytest.raises(IntegrityError):
                await put_tags([], 2)
            async with factory() as db:
                assert (await module.get_reviewer_360_tags(context(), db)).model_dump() == before_failure

            async with scoped.begin() as conn:
                def prompt_step(connection, action):
                    with Operations.context(MigrationContext.configure(connection)):
                        getattr(prompt_migration, action)()
                await conn.run_sync(lambda c: transfer_step(c, "downgrade"))
                await conn.run_sync(lambda c: prompt_step(c, "downgrade"))
                assert (await conn.execute(text("SELECT calibration_import_enabled FROM performance_other_settings WHERE id=1"))).scalar_one() is False
                await conn.run_sync(lambda c: prompt_step(c, "upgrade"))
                await conn.run_sync(lambda c: transfer_step(c, "upgrade"))
            async with factory() as db:
                restored = await module.get_other_settings(context(), db)
                assert restored.authorization_prompt_zh == module.OtherSettingsOut().authorization_prompt_zh
                assert restored.authorization_prompt_en == module.OtherSettingsOut().authorization_prompt_en
                assert restored.manual_result_opening_enabled is False

            async with scoped.begin() as conn:
                await conn.execute(text("ALTER TABLE performance_audit_events ADD CONSTRAINT reject_other_setting_audit CHECK (event_type <> 'PERFORMANCE_OTHER_SETTING_UPDATED') NOT VALID"))
            async with factory() as db:
                from sqlalchemy.exc import IntegrityError
                with pytest.raises(IntegrityError):
                    await module.update_other_settings(module.OtherSettingsPatch(calibration_import_enabled=True, authorization_prompt_zh="不可提交的提示"), context(), db)
                await db.rollback()
            async with factory() as db:
                rolled_back = await module.get_other_settings(context(), db)
                assert rolled_back.calibration_import_enabled is False
                assert rolled_back.authorization_prompt_zh == module.OtherSettingsOut().authorization_prompt_zh

            async with scoped.begin() as conn:
                await conn.run_sync(lambda c: migrate(c, "downgrade"))
                assert (await conn.execute(text("SELECT to_regclass('performance_other_settings')"))).scalar_one() is None
                assert (await conn.execute(text("SELECT count(*) FROM preserved_record"))).scalar_one() == 1
                await conn.run_sync(lambda c: migrate(c, "upgrade"))
                assert (await conn.execute(text("SELECT count(*) FROM performance_other_settings"))).scalar_one() == 0
                await conn.execute(text("INSERT INTO performance_other_settings (id) VALUES (1)"))
            async with factory() as db:
                assert (await module.get_other_settings(context(), db)).model_dump() == module.OtherSettingsOut().model_dump()
        finally:
            await scoped.dispose()
            async with engine.begin() as conn:
                await conn.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))
            await engine.dispose()

    asyncio.run(run())
