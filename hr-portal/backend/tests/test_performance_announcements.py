from datetime import UTC, datetime, timedelta
from io import BytesIO
from unittest.mock import AsyncMock

import pytest
from fastapi import FastAPI, HTTPException, UploadFile
from fastapi.testclient import TestClient
from PIL import Image
from pydantic import ValidationError
from sqlalchemy import BigInteger, Integer, JSON, MetaData, create_engine, event, func, select
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.core.db import get_session
from app.performance import announcement_service as service
from app.performance import auth_context as identities
from app.performance import workbench_settings_router as routes
from app.performance.auth_context import PerformanceAccessContext, PerformanceIdentityMappingConflict, get_performance_access_context
from app.performance.models import (
    PerformanceAnnouncementAcknowledgement as Ack,
    PerformanceAnnouncementImage as Picture,
    PerformanceAuthorizationSnapshot as AuthorizationSnapshot,
    PerformanceAuthorizationSnapshotPerson as SnapshotPerson,
    PerformanceCycle as Cycle,
    PerformanceNodeTask as Task,
    PerformanceProject as Project,
    PerformanceProjectMember as Member,
    PerformanceProjectMemberSnapshot as Snapshot,
    PerformanceProjectNodeSnapshot as Node,
    PerformanceTemplate as Template,
    PerformanceWorkbenchAnnouncement as Announcement,
    PerformanceWorkbenchSetting as Setting,
)


class Database:
    def __init__(self, session):
        self.session = session

    async def scalar(self, statement):
        return self.session.scalar(statement)

    async def execute(self, statement):
        return self.session.execute(statement)

    async def get(self, model, identity):
        return self.session.get(model, identity)

    def add(self, item):
        self.session.add(item)

    async def flush(self):
        self.session.flush()

    async def commit(self):
        self.session.commit()

    async def refresh(self, item):
        self.session.refresh(item)

    async def delete(self, item):
        self.session.delete(item)


@pytest.fixture
def db():
    engine = create_engine("sqlite://", poolclass=StaticPool, connect_args={"check_same_thread": False})

    @event.listens_for(engine, "connect")
    def configure(connection, _):
        connection.execute("PRAGMA foreign_keys=ON")
        connection.create_function("octet_length", 1, len)
        connection.create_function("jsonb_typeof", 1, lambda value: "array" if value.startswith("[") else "object")

    metadata = MetaData()
    models = (Template, Cycle, AuthorizationSnapshot, SnapshotPerson, Project, Snapshot, Member, Node, Task, Picture, Announcement, Ack, Setting)
    for model in models:
        table = model.__table__.to_metadata(metadata)
        for column in table.columns:
            if isinstance(column.type, JSONB):
                column.type = JSON()
            if isinstance(column.type, BigInteger):
                column.type = Integer()
    metadata.create_all(engine)
    with Session(engine, expire_on_commit=False) as session:
        yield Database(session)
    engine.dispose()


def context(employee="HR", subject_type="EMPLOYEE", permissions=()):
    return PerformanceAccessContext(subject_type=subject_type, subject_id=99, display_name="Test", account_type=None,
        portal_entry_permissions=("performance.app",), role_grants=(), permission_codes=permissions,
        effective_employee_no=employee)


def cycle(db, ref, identity):
    now = datetime.now(UTC)
    item = Cycle(id=identity, cycle_ref=ref, name=ref, period_year=2026, period_type="ANNUAL",
        start_at=now, end_at=now + timedelta(days=90), lock_rule="IMMEDIATE", created_by_type="EMPLOYEE", created_by_ref="HR")
    db.add(item)
    db.session.flush()
    return item


def announcement(db, identity=1, **values):
    fields = routes.WorkbenchAnnouncementCreate(title="Announcement", link="/notice").model_dump()
    fields.update(values)
    item = Announcement(id=identity, **fields)
    db.add(item)
    db.session.flush()
    return item


def project_snapshot(db, *, project_id=1, snapshot_id=1, cycle_ref="A", actual=("E",), version=1, count=1):
    project = db.session.get(Project, project_id)
    if project is None:
        project = Project(id=project_id, project_ref=f"P{project_id}", cycle_ref=cycle_ref, name="Project", status="STARTED", evaluated_count=count)
        db.add(project)
    source = db.session.get(AuthorizationSnapshot, project_id)
    if source is None:
        source = AuthorizationSnapshot(id=project_id, cycle_ref=cycle_ref, status="LOCKED")
        db.add(source)
    db.session.flush()
    item = Snapshot(id=snapshot_id, project_id=project_id, cycle_ref=cycle_ref, snapshot_version=version,
        source_snapshot_id=project_id, source_filter={} if actual is None else {"task_generation_employee_nos": list(actual)})
    db.add(item)
    db.session.flush()
    return item


def member(db, snapshot_id, number, *, hrbp=None, manager=None):
    item = Member(snapshot_id=snapshot_id, employee_no=number, display_name=number,
        hrbp_employee_no=hrbp, direct_supervisor_employee_no=manager)
    db.add(item)
    db.session.flush()
    return item


def image_bytes(image_format="PNG"):
    buffer = BytesIO()
    Image.new("RGB", (4, 4), "blue").save(buffer, format=image_format)
    return buffer.getvalue()


@pytest.mark.parametrize("link", ["javascript:alert(1)", "JaVaScRiPt:alert(1)", "//example.com/a", "\\\\example.com", "/\\example.com", "data:text/html,x", "http:example.com", "https://", "https://exa\nmple.com"])
def test_unsafe_links_rejected_in_both_languages(link):
    for field in ("link", "link_en"):
        with pytest.raises(ValidationError):
            routes.WorkbenchAnnouncementCreate(**{"title": "Notice", "link": "/valid", field: link})
        with pytest.raises(ValidationError):
            routes.WorkbenchAnnouncementPatch(**{field: link})


@pytest.mark.parametrize("link", ["/notice?q=1", "notice/123", "https://example.com/n", "http://example.com"])
def test_valid_relative_and_http_links_preserved(link):
    assert routes.WorkbenchAnnouncementCreate(title="Notice", link=link, link_en=link).link == link


def test_role_payload_retires_single_role_and_rejects_missing_unknown_and_null_values():
    for values in ({"visibility_role": "HRBP"}, {"visibility": "指定角色"}, {"visibility_roles": ["ADMIN"]}):
        with pytest.raises(ValidationError):
            routes.WorkbenchAnnouncementCreate(title="Notice", link="/notice", **values)
    for values in ({"visibility_roles": None}, {"title_en": None}, {"require_ack": None}):
        with pytest.raises(ValidationError):
            routes.WorkbenchAnnouncementPatch(**values)
    item = routes.WorkbenchAnnouncementCreate(title="Notice", link="/notice", visibility="指定角色", visibility_roles=["HRBP", "REAL_LINE_MANAGER", "HRBP"])
    assert item.visibility_roles == ["HRBP", "REAL_LINE_MANAGER"]
    with pytest.raises(ValidationError):
        routes.WorkbenchAnnouncementCreate(title="Notice", link="/notice", description_en="x" * 1001)


@pytest.mark.asyncio
async def test_role_union_uses_latest_snapshot_actual_members_and_frozen_relationships(db):
    cycle(db, "A", 1)
    project_snapshot(db)
    member(db, 1, "E", hrbp="OLD")
    project_snapshot(db, snapshot_id=2, version=2)
    member(db, 2, "E", hrbp="HR", manager="MANAGER")
    member(db, 2, "REPORT_ONLY", hrbp="REPORT_HR", manager="REPORT_MANAGER")
    assert await service.audience_roles(db, "OLD", "A") == set()
    assert await service.audience_roles(db, "REPORT_HR", "A") == set()
    assert await service.audience_roles(db, "REPORT_MANAGER", "A") == set()
    assert await service.audience_roles(db, "HR", "A") == {"HRBP"}
    assert await service.audience_roles(db, "MANAGER", "A") == {"REAL_LINE_MANAGER"}
    notice = announcement(db, visibility="指定角色", visibility_roles=["HRBP", "REAL_LINE_MANAGER"])
    for identity in ("HR", "MANAGER"):
        assert (await service.visible_announcements(db, context(identity), "A"))[0] == [notice]
    assert (await service.visible_announcements(db, context("REPORT_HR"), "A"))[0] == []
    assert (await service.visible_announcements(db, context(None, "SYSTEM_ACCOUNT"), "A"))[0] == []
    assert (await service.visible_announcements(db, context("HR"), None))[0] == [notice]


@pytest.mark.asyncio
async def test_ambiguous_historical_actual_members_block_instead_of_granting_roles(db):
    cycle(db, "A", 1)
    project_snapshot(db, actual=None, count=1)
    member(db, 1, "E", hrbp="HR")
    with pytest.raises(HTTPException) as error:
        await service.audience_roles(db, "HR", "A")
    assert error.value.status_code == 409
    assert error.value.detail == "ANNOUNCEMENT_MEMBER_SCOPE_UNRESOLVED"


@pytest.mark.asyncio
async def test_legacy_tasks_classify_actual_members_but_revoked_tasks_do_not(db):
    cycle(db, "A", 1)
    project_snapshot(db, actual=None, count=1)
    member(db, 1, "E", hrbp="HR")
    member(db, 1, "REPORT", hrbp="REPORT_HR")
    db.add(Node(id=1, project_id=1, node_id="node", node_type="evaluation", name="Evaluation", node_order=0))
    db.session.flush()
    for number, revoked_at in (("E", None), ("REPORT", datetime.now(UTC))):
        db.add(Task(project_id=1, cycle_ref="A", member_snapshot_id=1, node_snapshot_id=1,
            target_employee_no=number, handler_ref="HR", task_kind="evaluation", revoked_at=revoked_at))
    db.session.flush()
    assert await service.audience_roles(db, "HR", "A") == {"HRBP"}
    assert await service.audience_roles(db, "REPORT_HR", "A") == set()


@pytest.mark.asyncio
async def test_acknowledgement_persists_across_sessions_cycles_and_edits(db, monkeypatch):
    cycle(db, "A", 1)
    cycle(db, "B", 2)
    item = announcement(db, require_ack=True)
    db.session.commit()
    assert await service.acknowledge_announcement(db, context(), 1, "A") == {"acknowledged": True}
    assert await service.acknowledge_announcement(db, context(), 1, "A") == {"acknowledged": True}
    with Session(db.session.get_bind()) as another_device:
        persisted = another_device.scalar(select(Ack).where(Ack.announcement_id == 1, Ack.cycle_ref == "A"))
        assert persisted.employee_no == "HR"
    db.session.expire_all()
    assert await db.scalar(select(func.count(Ack.id))) == 1
    first = await routes.get_workbench_announcement_feed(cycle_ref=None, cycle_id=1, context=context(), db=db)
    second = await routes.get_workbench_announcement_feed(cycle_ref="B", cycle_id=None, context=context(), db=db)
    assert first.cycle_ref == "A" and first.items[0].acknowledged is True
    assert second.cycle_ref == "B" and second.items[0].acknowledged is False
    monkeypatch.setattr(routes, "_audit", AsyncMock())
    await routes.update_workbench_announcement(1, routes.WorkbenchAnnouncementPatch(title="Edited", title_en="Updated", description="New body"), context(), db)
    await routes.update_workbench_announcement_status(1, routes.WorkbenchStatusPatch(status="inactive"), context(), db)
    await routes.update_workbench_announcement_status(1, routes.WorkbenchStatusPatch(status="active"), context(), db)
    first = await routes.get_workbench_announcement_feed(cycle_ref="A", cycle_id=None, context=context(), db=db)
    assert first.items[0].title == "Edited" and first.items[0].title_en == "Updated"
    assert first.items[0].acknowledged is True
    assert await service.acknowledge_announcement(db, context(), 1, "B") == {"acknowledged": True}
    assert await db.scalar(select(func.count(Ack.id))) == 2
    await routes.delete_workbench_announcement(1, context(), db)
    assert await db.scalar(select(func.count(Ack.id))) == 0


@pytest.mark.asyncio
async def test_confirmation_rejects_wrong_scope_missing_identity_and_disabled_states(db):
    cycle(db, "A", 1)
    cycle(db, "B", 2)
    announcement(db, cycle_ref="A", require_ack=True)
    for cycle_ref, caller, expected in (("B", context(), 404), ("A", context(None, "SYSTEM_ACCOUNT"), 403), (None, context(), 422)):
        with pytest.raises(HTTPException) as error:
            await service.acknowledge_announcement(db, caller, 1, cycle_ref)
        assert error.value.status_code == expected
    item = await db.get(Announcement, 1)
    for changes in ({"status": "inactive"}, {"status": "active", "require_ack": False}):
        for key, value in changes.items():
            setattr(item, key, value)
        db.session.flush()
        with pytest.raises(HTTPException) as error:
            await service.acknowledge_announcement(db, context(), 1, "A")
        assert error.value.status_code == 409
    assert await db.scalar(select(func.count(Ack.id))) == 0


@pytest.mark.asyncio
async def test_cycle_alias_conflict_and_no_cycle_feed_contract(db):
    cycle(db, "A", 1)
    cycle(db, "B", 2)
    announcement(db, require_ack=True)
    announcement(db, identity=2, cycle_ref="A")
    result = await routes.get_workbench_announcement_feed(cycle_ref=None, cycle_id=None, context=context(), db=db)
    assert result.cycle_ref is None
    assert [item.id for item in result.items] == [1]
    assert result.items[0].acknowledged is False
    assert result.items[0].require_ack is False
    assert {"title_en", "link_en", "description", "description_en", "image_id", "image_en_id"} <= result.items[0].model_dump().keys()
    with pytest.raises(HTTPException) as error:
        await routes.get_workbench_announcement_feed(cycle_ref="A", cycle_id=2, context=context(), db=db)
    assert error.value.status_code == 404


@pytest.mark.parametrize("image_format,content_type", [("PNG", "image/png"), ("JPEG", "image/jpeg")])
def test_image_decode_checks_actual_format(image_format, content_type):
    assert service.validate_announcement_image(image_bytes(image_format)) == content_type


@pytest.mark.parametrize("content", [b"not an image", b"\x89PNG\r\n\x1a\nwrong", image_bytes("GIF"), image_bytes()[:40], image_bytes("JPEG")[:-20]])
def test_fake_truncated_and_unsupported_images_rejected(content):
    with pytest.raises(HTTPException) as error:
        service.validate_announcement_image(content)
    assert error.value.status_code == 422


def test_actual_byte_limit_includes_boundary():
    png = image_bytes()
    assert service.validate_announcement_image(png + b"\0" * (service.MAX_IMAGE_BYTES - len(png))) == "image/png"
    with pytest.raises(HTTPException) as error:
        service.validate_announcement_image(png + b"\0" * (service.MAX_IMAGE_BYTES + 1 - len(png)))
    assert error.value.status_code == 413


@pytest.mark.asyncio
async def test_upload_ignores_declared_mime_and_images_are_private_until_associated(db):
    admin = context(permissions=("performance.configuration.manage",))
    upload = UploadFile(file=BytesIO(image_bytes()), filename="claimed.jpg", headers={"content-type": "text/plain"})
    result = await routes.upload_announcement_image(upload, admin, db)
    assert (await db.get(Picture, result.id)).content_type == "image/png"
    with pytest.raises(HTTPException) as error:
        await routes.get_announcement_image(result.id, None, context(), db)
    assert error.value.status_code == 404
    response = await routes.get_announcement_image(result.id, None, admin, db)
    assert response.body == image_bytes()
    assert response.headers["cache-control"] == "no-store"
    assert response.headers["x-content-type-options"] == "nosniff"
    announcement(db, image_en_id=result.id)
    assert (await routes.get_announcement_image(result.id, None, context(None, "SYSTEM_ACCOUNT"), db)).body == image_bytes()
    item = await db.get(Announcement, 1)
    item.status = "inactive"
    db.session.flush()
    with pytest.raises(HTTPException) as error:
        await routes.get_announcement_image(result.id, None, context(), db)
    assert error.value.status_code == 404


@pytest.mark.asyncio
async def test_image_references_and_role_patch_validated_before_write(db, monkeypatch):
    item = announcement(db, visibility="指定角色", visibility_roles=["HRBP"])
    monkeypatch.setattr(routes, "_audit", AsyncMock())
    for payload in (routes.WorkbenchAnnouncementPatch(image_id=100), routes.WorkbenchAnnouncementPatch(visibility_roles=[])):
        with pytest.raises(HTTPException) as error:
            await routes.update_workbench_announcement(1, payload, context(), db)
        assert error.value.status_code == 422
    assert item.image_id is None and item.visibility_roles == ["HRBP"]
    with pytest.raises(HTTPException) as error:
        await routes.create_workbench_announcement(routes.WorkbenchAnnouncementCreate(title="Bad", link="/notice", image_en_id=100), context(), db)
    assert error.value.status_code == 422


@pytest.mark.asyncio
async def test_unmapped_and_conflicting_portal_identity_never_gain_role_visibility(db, monkeypatch):
    cycle(db, "A", 1)
    project_snapshot(db)
    member(db, 1, "E", hrbp="HR")
    announcement(db, visibility="指定角色", visibility_roles=["HRBP"], require_ack=True)
    caller = context(None, "PORTAL_USER")
    for resolution in (AsyncMock(return_value=None), AsyncMock(side_effect=PerformanceIdentityMappingConflict("conflicting mapping"))):
        monkeypatch.setattr(identities, "resolve_performance_employee_no", resolution)
        assert (await service.visible_announcements(db, caller, None))[0] == []
        assert await service.employee_identity(db, caller) is None
        with pytest.raises(HTTPException) as error:
            await service.acknowledge_announcement(db, caller, 1, "A")
        assert error.value.status_code == 403


@pytest.mark.asyncio
@pytest.mark.parametrize("identity_kind", ["system", "unmapped", "conflict"])
async def test_non_employee_reads_global_notice_without_uncompletable_ack_gate(db, monkeypatch, identity_kind):
    cycle(db, "A", 1)
    global_notice = announcement(db, require_ack=True)
    announcement(db, identity=2, visibility="指定角色", visibility_roles=["HRBP"], require_ack=True)
    if identity_kind == "system":
        caller = context(None, "SYSTEM_ACCOUNT")
    else:
        caller = context(None, "PORTAL_USER")
        resolution = AsyncMock(return_value=None) if identity_kind == "unmapped" else AsyncMock(side_effect=PerformanceIdentityMappingConflict("conflicting mapping"))
        monkeypatch.setattr(identities, "resolve_performance_employee_no", resolution)
    result = await routes.get_workbench_announcement_feed(cycle_ref="A", cycle_id=None, context=caller, db=db)
    assert result.announcement_enabled is True and result.cycle_ref == "A"
    assert [item.id for item in result.items] == [global_notice.id]
    assert result.items[0].require_ack is False and result.items[0].acknowledged is False
    with pytest.raises(HTTPException) as error:
        await routes.acknowledge_workbench_announcement(global_notice.id, routes.AnnouncementAcknowledgeIn(cycle_ref="A"), caller, db)
    assert error.value.status_code == 403
    assert global_notice.require_ack is True
    assert await db.scalar(select(func.count(Ack.id))) == 0
    admin_page = await routes.list_workbench_announcements(keyword=None, status_filter=None, page=1, page_size=10, _=context(), db=db)
    assert admin_page.items[0].require_ack is True
    monkeypatch.undo()
    employee_feed = await routes.get_workbench_announcement_feed(cycle_ref="A", cycle_id=None, context=context(), db=db)
    assert employee_feed.items[0].require_ack is True


@pytest.mark.asyncio
async def test_role_image_and_confirmation_follow_cycle_visibility(db):
    cycle(db, "A", 1)
    cycle(db, "B", 2)
    project_snapshot(db)
    member(db, 1, "E", manager="MANAGER")
    db.add(Picture(id=1, content=image_bytes(), content_type="image/png"))
    db.session.flush()
    announcement(db, cycle_ref="A", visibility="指定角色", visibility_roles=["REAL_LINE_MANAGER"], image_id=1, require_ack=True)
    assert (await routes.get_announcement_image(1, "A", context("MANAGER"), db)).body == image_bytes()
    assert await service.acknowledge_announcement(db, context("MANAGER"), 1, "A") == {"acknowledged": True}
    for caller, ref in ((context("HR"), "A"), (context("MANAGER"), "B"), (context(None, "SYSTEM_ACCOUNT"), "A")):
        with pytest.raises(HTTPException) as error:
            await routes.get_announcement_image(1, ref, caller, db)
        assert error.value.status_code == 404
    with pytest.raises(HTTPException) as error:
        await service.acknowledge_announcement(db, context("HR"), 1, "A")
    assert error.value.status_code == 404


@pytest.mark.asyncio
async def test_global_switch_blocks_confirmation_and_image_read(db):
    cycle(db, "A", 1)
    db.add(Picture(id=1, content=image_bytes(), content_type="image/png"))
    db.session.flush()
    announcement(db, require_ack=True, image_id=1)
    db.add(Setting(id=1, announcement_enabled=False))
    db.session.flush()
    with pytest.raises(HTTPException) as error:
        await service.acknowledge_announcement(db, context(), 1, "A")
    assert error.value.status_code == 409
    with pytest.raises(HTTPException) as error:
        await routes.get_announcement_image(1, "A", context(), db)
    assert error.value.status_code == 404


@pytest.mark.asyncio
async def test_bilingual_crud_roundtrip_preserves_body_when_ack_is_toggled(db, monkeypatch):
    monkeypatch.setattr(routes, "_audit", AsyncMock())
    db.add(Picture(id=1, content=image_bytes(), content_type="image/png"))
    db.session.flush()
    created = await routes.create_workbench_announcement(routes.WorkbenchAnnouncementCreate(
        title="中文公告", title_en="English notice", link="/notice", link_en="https://example.com/notice",
        description="中文说明", description_en="English description", image_id=1, image_en_id=1,
        visibility="指定角色", visibility_roles=["HRBP", "REAL_LINE_MANAGER"], require_ack=True,
    ), context(), db)
    assert created.visibility_roles == ["HRBP", "REAL_LINE_MANAGER"]
    assert created.title_en == "English notice" and created.image_en_id == 1
    await routes.update_workbench_announcement(created.id, routes.WorkbenchAnnouncementPatch(require_ack=False), context(), db)
    saved = await routes.update_workbench_announcement(created.id, routes.WorkbenchAnnouncementPatch(require_ack=True), context(), db)
    assert saved.description == "中文说明" and saved.description_en == "English description"
    assert saved.image_id == 1 and saved.image_en_id == 1
    page = await routes.list_workbench_announcements(keyword=None, status_filter=None, page=1, page_size=10, _=context(), db=db)
    assert page.total == 1 and page.items[0].title_en == "English notice"


@pytest.mark.asyncio
async def test_upload_size_is_checked_on_bytes_before_decoding_or_storage(db):
    upload = UploadFile(file=BytesIO(b"x" * (service.MAX_IMAGE_BYTES + 1)), filename="small.png")
    with pytest.raises(HTTPException) as error:
        await routes.upload_announcement_image(upload, context(), db)
    assert error.value.status_code == 413
    assert await db.scalar(select(func.count(Picture.id))) == 0


def test_http_auth_permission_and_multipart_contract(db):
    app = FastAPI()
    app.include_router(routes.router)
    app.include_router(routes.consumer_router)

    async def database():
        yield db

    async def unauthenticated():
        raise HTTPException(401, "未登录")

    app.dependency_overrides[get_session] = database
    app.dependency_overrides[get_performance_access_context] = unauthenticated
    with TestClient(app) as client:
        assert client.get("/performance/workbench/announcement-images/1").status_code == 401
        app.dependency_overrides[get_performance_access_context] = lambda: context()
        assert client.post("/performance/workbench-settings/announcement-images", files={"file": ("notice.png", image_bytes(), "image/png")}).status_code == 403
        app.dependency_overrides[get_performance_access_context] = lambda: context(permissions=("performance.configuration.manage",))
        response = client.post("/performance/workbench-settings/announcement-images", files={"file": ("notice.jpg", image_bytes(), "text/html")})
        assert response.status_code == 201 and set(response.json()) == {"id"}
        response = client.post("/performance/workbench-settings/announcements", json={"title": "Notice", "link": "javascript:alert(1)"})
        assert response.status_code == 422
