from pathlib import Path

import pytest

from app.performance.models import (
    AUTHORIZATION_SNAPSHOT_STATUS_LOCKED,
    DYNAMIC_ASSIGNMENT_ACTOR_TYPE_EMPLOYEE,
    DYNAMIC_ASSIGNMENT_SOURCE_CONFIGURATION,
    DYNAMIC_ASSIGNMENT_TARGET_TYPE_EMPLOYEE,
    DYNAMIC_IDENTITY_TYPE_CALIBRATOR,
    DYNAMIC_IDENTITY_TYPE_DIRECT_MANAGER,
    DYNAMIC_IDENTITY_TYPE_HRBP,
    DYNAMIC_IDENTITY_TYPE_INDIRECT_MANAGER,
    DYNAMIC_IDENTITY_TYPE_REVIEWER_360,
)
from app.performance.snapshot_service import (
    DynamicIdentityInput,
    RosterAuthorizationInput,
    SnapshotLockedError,
    apply_live_employment_statuses,
    assert_snapshot_mutable,
    build_snapshot_people,
    resolve_identity_scopes,
    _assignment_state,
)


def _roster_inputs():
    return (
        RosterAuthorizationInput(
            employee_no="100",
            display_name="总监",
            employment_status="在职",
        ),
        RosterAuthorizationInput(
            employee_no="200",
            display_name="经理",
            direct_supervisor_source_value="总监",
            hrbp_source_value="HRBP",
            employment_status="在职",
        ),
        RosterAuthorizationInput(
            employee_no="300",
            display_name="员工甲",
            standard_position="软件工程师",
            direct_supervisor_source_value="经理",
            hrbp_source_value="HRBP",
            employment_status="在职",
        ),
        RosterAuthorizationInput(
            employee_no="400",
            display_name="HRBP",
            employment_status="在职",
        ),
        RosterAuthorizationInput(
            employee_no="500",
            display_name="校准人",
            employment_status="在职",
        ),
    )


def _scope_refs(scopes):
    return {(scope.target_type, scope.target_ref) for scope in scopes}


def test_build_snapshot_people_resolves_manager_and_hrbp_to_employee_numbers():
    people = build_snapshot_people(_roster_inputs())
    employee = next(person for person in people if person.employee_no == "300")

    assert employee.direct_supervisor_employee_no == "200"
    assert employee.direct_supervisor_source_value == "经理"
    assert employee.hrbp_employee_no == "400"
    assert employee.hrbp_source_value == "HRBP"
    assert employee.standard_position == "软件工程师"


def test_draft_changes_replace_relationships_before_lock():
    initial_people = build_snapshot_people(_roster_inputs())
    changed_people = build_snapshot_people(
        (
            *_roster_inputs()[:2],
            RosterAuthorizationInput(
                employee_no="300",
                display_name="员工甲",
                direct_supervisor_source_value="总监",
                hrbp_source_value="HRBP",
                employment_status="在职",
            ),
            *_roster_inputs()[3:],
        )
    )

    initial_employee = next(person for person in initial_people if person.employee_no == "300")
    changed_employee = next(person for person in changed_people if person.employee_no == "300")

    assert initial_employee.direct_supervisor_employee_no == "200"
    assert changed_employee.direct_supervisor_employee_no == "100"


def test_build_snapshot_people_keeps_ambiguous_name_references_unresolved():
    people = build_snapshot_people(
        (
            RosterAuthorizationInput(employee_no="100", display_name="同名"),
            RosterAuthorizationInput(employee_no="200", display_name="同名"),
            RosterAuthorizationInput(
                employee_no="300",
                display_name="员工甲",
                direct_supervisor_source_value="同名",
                hrbp_source_value="不存在",
            ),
        )
    )

    employee = next(person for person in people if person.employee_no == "300")
    assert employee.direct_supervisor_employee_no is None
    assert employee.hrbp_employee_no is None


def test_build_snapshot_people_prefers_employee_number_to_name():
    people = build_snapshot_people(
        (
            RosterAuthorizationInput(employee_no="100", display_name="200"),
            RosterAuthorizationInput(employee_no="200", display_name="经理"),
            RosterAuthorizationInput(
                employee_no="300",
                display_name="员工甲",
                direct_supervisor_source_value=" 200 ",
            ),
        )
    )

    employee = next(person for person in people if person.employee_no == "300")
    assert employee.direct_supervisor_employee_no == "200"



    with pytest.raises(SnapshotLockedError):
        assert_snapshot_mutable(AUTHORIZATION_SNAPSHOT_STATUS_LOCKED)


def test_live_termination_sync_only_changes_employment_status():
    people = build_snapshot_people(_roster_inputs())
    updated_people = apply_live_employment_statuses(people, {"300": "离职"})
    original_employee = next(person for person in people if person.employee_no == "300")
    updated_employee = next(person for person in updated_people if person.employee_no == "300")

    assert updated_employee.employment_status == original_employee.employment_status == "在职"
    assert updated_employee.live_employment_status == "离职"
    assert updated_employee.direct_supervisor_employee_no == original_employee.direct_supervisor_employee_no
    assert updated_employee.hrbp_employee_no == original_employee.hrbp_employee_no


def test_resolver_uses_frozen_reporting_chain_and_hrbp_scope():
    people = build_snapshot_people(_roster_inputs())

    direct_scopes = resolve_identity_scopes(
        people,
        (),
        actor_type=DYNAMIC_ASSIGNMENT_ACTOR_TYPE_EMPLOYEE,
        actor_ref="200",
        identity_type=DYNAMIC_IDENTITY_TYPE_DIRECT_MANAGER,
    )
    indirect_scopes = resolve_identity_scopes(
        people,
        (),
        actor_type=DYNAMIC_ASSIGNMENT_ACTOR_TYPE_EMPLOYEE,
        actor_ref="100",
        identity_type=DYNAMIC_IDENTITY_TYPE_INDIRECT_MANAGER,
    )
    hrbp_scopes = resolve_identity_scopes(
        people,
        (),
        actor_type=DYNAMIC_ASSIGNMENT_ACTOR_TYPE_EMPLOYEE,
        actor_ref="400",
        identity_type=DYNAMIC_IDENTITY_TYPE_HRBP,
    )

    assert _scope_refs(direct_scopes) == {(DYNAMIC_ASSIGNMENT_TARGET_TYPE_EMPLOYEE, "300")}
    assert _scope_refs(indirect_scopes) == {(DYNAMIC_ASSIGNMENT_TARGET_TYPE_EMPLOYEE, "300")}
    assert _scope_refs(hrbp_scopes) == {
        (DYNAMIC_ASSIGNMENT_TARGET_TYPE_EMPLOYEE, "200"),
        (DYNAMIC_ASSIGNMENT_TARGET_TYPE_EMPLOYEE, "300"),
    }


def test_resolver_uses_explicit_dynamic_assignments_for_calibrator_and_360():
    people = build_snapshot_people(_roster_inputs())
    assignments = (
        DynamicIdentityInput(
            actor_type=DYNAMIC_ASSIGNMENT_ACTOR_TYPE_EMPLOYEE,
            actor_ref="500",
            identity_type=DYNAMIC_IDENTITY_TYPE_CALIBRATOR,
            target_type=DYNAMIC_ASSIGNMENT_TARGET_TYPE_EMPLOYEE,
            target_ref="300",
            source_type=DYNAMIC_ASSIGNMENT_SOURCE_CONFIGURATION,
        ),
        DynamicIdentityInput(
            actor_type=DYNAMIC_ASSIGNMENT_ACTOR_TYPE_EMPLOYEE,
            actor_ref="200",
            identity_type=DYNAMIC_IDENTITY_TYPE_REVIEWER_360,
            target_type=DYNAMIC_ASSIGNMENT_TARGET_TYPE_EMPLOYEE,
            target_ref="300",
        ),
    )

    calibrator_scopes = resolve_identity_scopes(
        people,
        assignments,
        actor_type=DYNAMIC_ASSIGNMENT_ACTOR_TYPE_EMPLOYEE,
        actor_ref="500",
        identity_type=DYNAMIC_IDENTITY_TYPE_CALIBRATOR,
    )
    reviewer_scopes = resolve_identity_scopes(
        people,
        assignments,
        actor_type=DYNAMIC_ASSIGNMENT_ACTOR_TYPE_EMPLOYEE,
        actor_ref="200",
        identity_type=DYNAMIC_IDENTITY_TYPE_REVIEWER_360,
    )

    assert _scope_refs(calibrator_scopes) == {(DYNAMIC_ASSIGNMENT_TARGET_TYPE_EMPLOYEE, "300")}
    assert _scope_refs(reviewer_scopes) == {(DYNAMIC_ASSIGNMENT_TARGET_TYPE_EMPLOYEE, "300")}


def test_assignment_state_detects_same_scope_metadata_changes():
    original = DynamicIdentityInput(
        actor_type=DYNAMIC_ASSIGNMENT_ACTOR_TYPE_EMPLOYEE,
        actor_ref="700",
        identity_type=DYNAMIC_IDENTITY_TYPE_REVIEWER_360,
        target_type=DYNAMIC_ASSIGNMENT_TARGET_TYPE_EMPLOYEE,
        target_ref="300",
        assigned_by_type=DYNAMIC_ASSIGNMENT_ACTOR_TYPE_EMPLOYEE,
        assigned_by_ref="300",
        is_active=True,
    )
    changed = DynamicIdentityInput(
        actor_type=DYNAMIC_ASSIGNMENT_ACTOR_TYPE_EMPLOYEE,
        actor_ref="700",
        identity_type=DYNAMIC_IDENTITY_TYPE_REVIEWER_360,
        target_type=DYNAMIC_ASSIGNMENT_TARGET_TYPE_EMPLOYEE,
        target_ref="300",
        assigned_by_type=DYNAMIC_ASSIGNMENT_ACTOR_TYPE_EMPLOYEE,
        assigned_by_ref="200",
        is_active=False,
    )

    assert _assignment_state(original) != _assignment_state(changed)


def test_standard_position_migration_defines_both_snapshot_columns():
    migration_path = Path(__file__).resolve().parents[1] / "alembic" / "versions" / "0277_performance_standard_position.py"
    migration = migration_path.read_text(encoding="utf-8")
    assert 'down_revision = "0276_standard_field_direct_identity"' in migration
    assert 'op.add_column("performance_authorization_snapshot_people"' in migration
    assert 'op.add_column("performance_project_members"' in migration
    assert 'op.drop_column("performance_project_members", "standard_position")' in migration
    assert 'op.drop_column("performance_authorization_snapshot_people", "standard_position")' in migration


def test_snapshot_migration_defines_upgrade_and_downgrade_paths():
    migration_path = (
        Path(__file__).resolve().parents[1]
        / "alembic"
        / "versions"
        / "0170_performance_authorization_snapshots.py"
    )
    migration = migration_path.read_text(encoding="utf-8")

    assert 'down_revision = "0169_performance_authorization_foundation"' in migration
    assert 'op.create_table(\n        "performance_authorization_snapshots"' in migration
    assert 'op.create_table(\n        "performance_authorization_snapshot_people"' in migration
    assert 'op.create_table(\n        "performance_dynamic_identity_assignments"' in migration
    assert 'op.drop_table("performance_dynamic_identity_assignments")' in migration
    assert 'op.drop_table("performance_authorization_snapshot_people")' in migration
    assert 'op.drop_table("performance_authorization_snapshots")' in migration


def test_snapshot_organization_path_comes_only_from_atomic_levels():
    row = RosterAuthorizationInput(
        employee_no="E001", display_name="员工一",
        company_org="集团", department="研发", department_2="  ", department_3="平台",
        organization_ref="不可信的旧路径",
    )
    person = build_snapshot_people([row])[0]
    assert person.organization_ref == "集团/研发/平台"
    assert (person.company_org, person.department, person.department_2, person.department_3) == ("集团", "研发", None, "平台")


@pytest.mark.asyncio
@pytest.mark.parametrize("snapshot_status", ["在职", "离职"])
async def test_live_sync_preserves_snapshot_fields_and_identity_scopes(monkeypatch, snapshot_status):
    from types import SimpleNamespace
    from app.performance import snapshot_service
    from app.performance.models import PerformanceAuthorizationSnapshot, PerformanceAuthorizationSnapshotPerson

    state = build_snapshot_people(_roster_inputs())[2]
    person = SimpleNamespace(**vars(state))
    person.employment_status = snapshot_status
    before = dict(vars(person))
    snapshot = SimpleNamespace(id=7, status="LOCKED")

    class Db:
        commits = 0
        async def execute(self, statement):
            entity = statement.column_descriptions[0]["entity"]
            if entity is PerformanceAuthorizationSnapshot:
                return SimpleNamespace(scalar_one_or_none=lambda: snapshot)
            values = [person] if entity is PerformanceAuthorizationSnapshotPerson else []
            return SimpleNamespace(scalars=lambda: SimpleNamespace(all=lambda: values))
        async def commit(self):
            self.commits += 1

    db = Db()
    service = snapshot_service.PerformanceAuthorizationSnapshotService(db)
    await service.sync_employment_statuses("cycle:one", {" 300 ": " 离职 ", "unknown": "离职"})
    assert db.commits == 1
    assert vars(person) == {**before, "live_employment_status": "离职"}
    captured = []
    original_resolver = snapshot_service.resolve_identity_scopes
    def resolve(people, *args, **kwargs):
        captured.append(people[0])
        return original_resolver(people, *args, **kwargs)
    monkeypatch.setattr(snapshot_service, "resolve_identity_scopes", resolve)
    for live in ["离职", "在职", None]:
        person.live_employment_status = live
        for identity, actor in [("SELF", "300"), ("DIRECT_MANAGER", "200"), ("HRBP", "400")]:
            scopes = await service.resolve_scopes("cycle:one", actor_type="EMPLOYEE", actor_ref=actor, identity_type=identity)
            assert _scope_refs(scopes) == {(DYNAMIC_ASSIGNMENT_TARGET_TYPE_EMPLOYEE, "300")}
            assert captured[-1].employment_status == snapshot_status
            assert captured[-1].live_employment_status is None
            assert person.employment_status == snapshot_status


@pytest.mark.asyncio
@pytest.mark.parametrize("manual", [False, True])
async def test_explicit_roster_refresh_sets_snapshot_and_live_statuses(manual):
    from types import SimpleNamespace
    from app.performance.models import PerformanceAuthorizationSnapshot, PerformanceAuthorizationSnapshotPerson
    from app.performance.snapshot_service import PerformanceAuthorizationSnapshotService

    record = SimpleNamespace(employee_no="300", employment_status="在职", live_employment_status="在职", is_manually_maintained=manual)
    snapshot = SimpleNamespace(id=7, status="LOCKED")
    class Db:
        async def execute(self, statement):
            entity = statement.column_descriptions[0]["entity"]
            if entity is PerformanceAuthorizationSnapshot:
                return SimpleNamespace(scalar_one_or_none=lambda: snapshot)
            values = [record] if entity is PerformanceAuthorizationSnapshotPerson else []
            return SimpleNamespace(scalars=lambda: values)
        def add(self, _obj):
            pass
    await PerformanceAuthorizationSnapshotService(Db()).sync_roster(
        "cycle:one", [RosterAuthorizationInput(employee_no="300", display_name="员工", employment_status="离职")],
        actor_type="PORTAL_USER", actor_ref="1", allow_locked_update=True, commit=False,
    )
    assert record.employment_status == record.live_employment_status == "离职"


def test_live_status_guard_repair_migration_targets_current_head():
    import importlib.util
    path = Path(__file__).resolve().parents[1] / "alembic/versions/0279_performance_live_status_guard.py"
    spec = importlib.util.spec_from_file_location("live_status_guard_repair", path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    assert migration.down_revision == "0278_performance_live_status"
    assert len(migration.revision) <= 32
    source = path.read_text(encoding="utf-8")
    assert "CREATE OR REPLACE FUNCTION performance_guard_snapshot_person_mutation()" in source
    assert "ARRAY['live_employment_status', 'updated_at']" in source


def test_live_status_migration_compiles_snapshot_only_backfill_and_downgrade():
    import importlib.util
    from io import StringIO
    from alembic.migration import MigrationContext
    from alembic.operations import Operations

    path = Path(__file__).resolve().parents[1] / "alembic/versions/0278_performance_live_employment_status.py"
    spec = importlib.util.spec_from_file_location("live_status_migration_sql", path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    assert migration.down_revision == "0277_performance_standard_position"
    assert len(migration.revision) <= 32
    output = StringIO()
    context = MigrationContext.configure(dialect_name="postgresql", opts={"as_sql": True, "output_buffer": output})
    with Operations.context(context):
        migration.upgrade()
        migration.downgrade()
    sql = output.getvalue()
    assert "ADD COLUMN live_employment_status VARCHAR(64)" in sql
    assert "CREATE OR REPLACE FUNCTION performance_guard_snapshot_person_mutation()" in sql
    assert "ARRAY['live_employment_status', 'updated_at']" in sql
    assert "ARRAY['employment_status', 'updated_at']" in sql
    assert "UPDATE performance_authorization_snapshot_people SET live_employment_status = employment_status" in sql
    assert "DROP COLUMN live_employment_status" in sql
    assert "roster" not in sql.lower()


@pytest.mark.asyncio
async def test_live_status_isolated_postgres_migration_upgrade_downgrade():
    import os
    if os.getenv("RUN_PERFORMANCE_DB_TEST") != "1":
        pytest.skip("需显式启用本地隔离数据库验收")
    from uuid import uuid4
    import importlib.util
    from sqlalchemy import text
    from sqlalchemy.engine import make_url
    from sqlalchemy.ext.asyncio import create_async_engine
    from sqlalchemy.pool import NullPool
    from alembic.migration import MigrationContext
    from alembic.operations import Operations
    from app.core.config import settings

    assert make_url(settings.db_url_async).host in {"localhost", "127.0.0.1"}
    migration_path = Path(__file__).resolve().parents[1] / "alembic/versions/0278_performance_live_employment_status.py"
    spec = importlib.util.spec_from_file_location("live_employment_status_migration", migration_path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    assert migration.down_revision == "0277_performance_standard_position"
    assert len(migration.revision) <= 32
    engine = create_async_engine(settings.db_url_async, poolclass=NullPool, connect_args={"timeout": 3})
    schema = f"pm_live_status_{uuid4().hex}"
    try:
        async with engine.connect() as connection:
            transaction = await connection.begin()
            try:
                await connection.execute(text(f'CREATE SCHEMA "{schema}"'))
                await connection.execute(text(f'SET LOCAL search_path TO "{schema}"'))
                await connection.execute(text("CREATE TABLE performance_authorization_snapshots (id BIGINT PRIMARY KEY, status VARCHAR(16) NOT NULL)"))
                await connection.execute(text("CREATE TABLE performance_authorization_snapshot_people (id BIGINT PRIMARY KEY, snapshot_id BIGINT NOT NULL, employment_status VARCHAR(64), updated_at TIMESTAMPTZ)"))
                await connection.execute(text("""
                    CREATE FUNCTION performance_guard_snapshot_person_mutation()
                    RETURNS trigger AS $$
                    DECLARE snapshot_locked boolean;
                    BEGIN
                        SELECT status = 'LOCKED' INTO snapshot_locked
                        FROM performance_authorization_snapshots
                        WHERE id = COALESCE(NEW.snapshot_id, OLD.snapshot_id);
                        IF COALESCE(snapshot_locked, false) AND
                           (to_jsonb(NEW) - ARRAY['employment_status', 'updated_at'])
                           IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['employment_status', 'updated_at']) THEN
                            RAISE EXCEPTION 'locked performance authorization snapshots only allow employment status updates';
                        END IF;
                        RETURN COALESCE(NEW, OLD);
                    END;
                    $$ LANGUAGE plpgsql;
                """))
                await connection.execute(text("CREATE TRIGGER trg_performance_snapshot_people_locked_guard BEFORE INSERT OR UPDATE OR DELETE ON performance_authorization_snapshot_people FOR EACH ROW EXECUTE FUNCTION performance_guard_snapshot_person_mutation()"))
                await connection.execute(text("INSERT INTO performance_authorization_snapshots VALUES (7, 'LOCKED')"))
                def apply(sync, method):
                    with Operations.context(MigrationContext.configure(sync)):
                        getattr(migration, method)()
                await connection.run_sync(lambda sync: apply(sync, "upgrade"))
                assert (await connection.execute(text("SELECT live_employment_status FROM performance_authorization_snapshot_people"))).all() == []
                await connection.run_sync(lambda sync: apply(sync, "downgrade"))
                await connection.execute(text("INSERT INTO performance_authorization_snapshot_people (id,snapshot_id,employment_status) VALUES (1,7,'在职'),(2,7,'离职'),(3,7,NULL)"))
                await connection.run_sync(lambda sync: apply(sync, "upgrade"))
                assert (await connection.execute(text("SELECT employment_status,live_employment_status FROM performance_authorization_snapshot_people ORDER BY id"))).all() == [("在职", "在职"), ("离职", "离职"), (None, None)]
                await connection.execute(text("UPDATE performance_authorization_snapshot_people SET live_employment_status='离职' WHERE id=1"))
                await connection.run_sync(lambda sync: apply(sync, "downgrade"))
                assert (await connection.execute(text("SELECT employment_status FROM performance_authorization_snapshot_people ORDER BY id"))).scalars().all() == ["在职", "离职", None]
                assert (await connection.execute(text("SELECT column_name FROM information_schema.columns WHERE table_schema=:schema AND column_name='live_employment_status'"), {"schema": schema})).all() == []
            finally:
                await transaction.rollback()
            assert (await connection.execute(text("SELECT 1 FROM pg_namespace WHERE nspname=:schema"), {"schema": schema})).first() is None
    finally:
        await engine.dispose()
