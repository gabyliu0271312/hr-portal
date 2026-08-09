import asyncio
from uuid import uuid4

import pytest
from sqlalchemy import delete, func, select, text

from app.core.db import get_session_factory
from app.mapping.errors import MappingErrorCode, MappingException, conflict_error
from app.mapping.models import (
    MappingBinding,
    MappingPublishAudit,
    MappingRuleSetVersion,
)
from app.mapping.service import MappingService


class FakeDb:
    def __init__(self, *results):
        self.results = list(results)
        self.added = []
        self.flushed = 0
        self.executed = []

    def add(self, value):
        self.added.append(value)

    async def flush(self):
        self.flushed += 1

    async def execute(self, statement):
        self.executed.append(statement)
        if not self.results:
            raise AssertionError("FakeDb 没有为 execute 提供结果")
        return self.results.pop(0)


class ScalarResult:
    def __init__(self, value):
        self.value = value

    def scalar_one_or_none(self):
        return self.value

    def scalars(self):
        return self

    def all(self):
        return self.value


def test_conflict_error_factory_has_stable_code_and_http_status():
    error = conflict_error("期望版本与实际版本不一致")

    assert error.code == MappingErrorCode.MAPPING_VERSION_CONFLICT
    assert error.http_status == 409
    assert error.to_dict()["code"] == "MAPPING_VERSION_CONFLICT"


@pytest.mark.asyncio
async def test_create_version_is_db_independent_until_flush_and_freezes_v1_metadata():
    db = FakeDb()
    service = MappingService(db)

    version = await service.create_version(
        catalog_id=10,
        version=3,
        source_schema_hash="source",
        target_schema_hash="target",
        adapter="workflow",
        compatibility_state={"readable": True},
        standardization_rule_ids=[1, 2],
        caller_config_ref={"caller": "workflow"},
    )

    assert isinstance(version, MappingRuleSetVersion)
    assert version.catalog_id == 10
    assert version.version == 3
    assert version.status == "draft"
    assert version.mapping_schema_version == 1
    assert version.storage_mode == "component_v1"
    assert version.adapter == "workflow"
    assert version.compatibility_state == {"readable": True}
    assert db.added == [version]
    assert db.flushed == 1


@pytest.mark.asyncio
async def test_publish_version_rejects_already_published_version_without_db_setup():
    version = MappingRuleSetVersion(
        catalog_id=10,
        version=2,
        status="published",
        mapping_schema_version=1,
        source_schema_hash="",
        target_schema_hash="",
        adapter="",
        storage_mode="component_v1",
    )
    db = FakeDb(ScalarResult(version))

    with pytest.raises(MappingException) as exc_info:
        await MappingService(db).publish_version(
            catalog_id=10, version=2, published_by="tester"
        )

    assert exc_info.value.code == MappingErrorCode.MAPPING_VERSION_CONFLICT
    assert exc_info.value.http_status == 409
    assert db.flushed == 0


@pytest.mark.asyncio
async def test_rollback_version_rejects_unpublished_version_without_db_setup():
    version = MappingRuleSetVersion(
        catalog_id=10,
        version=2,
        status="draft",
        mapping_schema_version=1,
        source_schema_hash="",
        target_schema_hash="",
        adapter="",
        storage_mode="component_v1",
    )
    db = FakeDb(ScalarResult(version))

    with pytest.raises(MappingException) as exc_info:
        await MappingService(db).rollback_version(catalog_id=10, target_version=2)

    assert exc_info.value.code == MappingErrorCode.MAPPING_VERSION_CONFLICT
    assert exc_info.value.http_status == 409


@pytest.mark.asyncio
async def test_update_binding_version_rejects_optimistic_lock_conflict():
    binding = MappingBinding(
        id=7,
        caller="workflow",
        asset_id="asset",
        binding_key="default",
        version=4,
        expected_version=4,
        storage_mode="component_v1",
    )
    db = FakeDb(ScalarResult(binding))

    with pytest.raises(MappingException) as exc_info:
        await MappingService(db).update_binding_version(
            binding_id=7,
            expected_version=3,
            new_version=5,
        )

    assert exc_info.value.code == MappingErrorCode.MAPPING_VERSION_CONFLICT
    assert exc_info.value.http_status == 409
    assert "期望 3" in exc_info.value.message
    assert binding.version == 4
    assert db.flushed == 0


@pytest.mark.asyncio
async def test_service_missing_version_is_reported_as_not_found_conflict_code():
    db = FakeDb(ScalarResult(None))

    with pytest.raises(MappingException) as exc_info:
        await MappingService(db)._get_version(10, 99)

    assert exc_info.value.code == MappingErrorCode.MAPPING_VERSION_CONFLICT
    assert exc_info.value.http_status == 404


@pytest.mark.asyncio
async def test_publish_idempotent_retry_returns_original_event_id():
    binding = MappingBinding(
        id=7,
        caller="warehouse",
        asset_id="asset",
        binding_key="default",
        version=2,
        expected_version=2,
        storage_mode="component_v1",
    )
    from app.mapping.models import MappingPublishAudit

    audit = MappingPublishAudit(
        binding_id=7,
        event_id="stable-event",
        idempotency_key="publish:7:2",
        event_type="mapping_rule_set_published",
        mapping_version=2,
    )
    db = FakeDb(ScalarResult(binding), ScalarResult(audit))

    result = await MappingService(db).publish(
        binding_id=7,
        expected_version=2,
        actor="tester",
    )

    assert result == {
        "status": "already_published",
        "event_id": "stable-event",
        "binding_id": 7,
        "version": 2,
    }
    assert db.added == []


async def _require_mapping_postgres():
    try:
        async with get_session_factory()() as db:
            await db.execute(select(1))
            exists = await db.scalar(text(
                "SELECT 1 FROM information_schema.tables "
                "WHERE table_name = 'mapping_publish_audits'"
            ))
            if not exists:
                raise AssertionError("PostgreSQL integration requires migration 0197_mapping_metadata")
    except Exception as exc:
        raise AssertionError(f"PostgreSQL integration database unavailable: {exc}") from exc


@pytest.mark.postgres_acceptance
@pytest.mark.asyncio
async def test_publish_same_request_is_idempotent_across_two_postgres_workers():
    await _require_mapping_postgres()
    binding_key = f"concurrency-{uuid4().hex}"
    async with get_session_factory()() as db:
        binding = MappingBinding(
            caller="warehouse",
            asset_id=f"mapping-test-{uuid4().hex}",
            binding_key=binding_key,
            version=0,
            expected_version=1,
            storage_mode="component_v1",
        )
        db.add(binding)
        await db.commit()
        binding_id = binding.id

    start = asyncio.Event()

    async def worker():
        async with get_session_factory()() as db:
            await start.wait()
            result = await MappingService(db).publish(
                binding_id=binding_id,
                expected_version=1,
                actor="concurrency-test",
            )
            await db.commit()
            return result

    try:
        workers = [asyncio.create_task(worker()) for _ in range(2)]
        start.set()
        results = await asyncio.gather(*workers)
        assert {result["status"] for result in results} <= {"published", "already_published"}
        assert results[0]["event_id"] == results[1]["event_id"]
        async with get_session_factory()() as db:
            count = await db.scalar(select(func.count()).select_from(MappingPublishAudit).where(
                MappingPublishAudit.idempotency_key == f"publish:{binding_id}:1"
            ))
            assert count == 1
    finally:
        async with get_session_factory()() as db:
            await db.execute(delete(MappingPublishAudit).where(
                MappingPublishAudit.binding_id == binding_id
            ))
            await db.execute(delete(MappingBinding).where(MappingBinding.id == binding_id))
            await db.commit()


@pytest.mark.asyncio
async def test_wage_rollout_persists_gray_control_and_audit_without_rule_body_copy():
    db = FakeDb(ScalarResult(None))

    result = await MappingService(db).configure_wage_rollout(
        asset_id="emp_monthly_salary",
        expected_version=0,
        mode="gray",
        component_percent=25,
        actor="tester",
    )

    binding = db.added[0]
    audit = db.added[1]
    assert result["mode"] == "gray"
    assert result["component_percent"] == 25
    assert binding.storage_mode == "component_v1"
    assert binding.expected_version == 1
    assert binding.legacy_snapshot["wage_rollout"]["mode"] == "gray"
    assert audit.event_type == "wage_rollout_changed"
    assert audit.payload == {
        "asset_id": "emp_monthly_salary",
        "mode": "gray",
        "component_percent": 25,
    }
    assert binding.legacy_snapshot["wage_rollout"]["audit_id"] == audit.id
    assert not hasattr(binding, "mapping_rules")


@pytest.mark.asyncio
async def test_wage_rollout_rejects_stale_expected_version_with_http_409():
    binding = MappingBinding(
        id=7,
        caller="warehouse",
        asset_id="emp_monthly_salary",
        binding_key="wage_rollout",
        version=3,
        expected_version=3,
        storage_mode="legacy",
    )
    db = FakeDb(ScalarResult(binding))

    with pytest.raises(MappingException) as exc_info:
        await MappingService(db).configure_wage_rollout(
            asset_id="emp_monthly_salary",
            expected_version=2,
            mode="rollback",
            component_percent=0,
            actor="tester",
        )

    assert exc_info.value.code == MappingErrorCode.MAPPING_VERSION_CONFLICT
    assert exc_info.value.http_status == 409
    assert binding.expected_version == 3
