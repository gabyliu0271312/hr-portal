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
            direct_manager_source_value="总监",
            hrbp_source_value="HRBP",
            employment_status="在职",
        ),
        RosterAuthorizationInput(
            employee_no="300",
            display_name="员工甲",
            direct_manager_source_value="经理",
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

    assert employee.direct_manager_employee_no == "200"
    assert employee.direct_manager_source_value == "经理"
    assert employee.hrbp_employee_no == "400"
    assert employee.hrbp_source_value == "HRBP"


def test_draft_changes_replace_relationships_before_lock():
    initial_people = build_snapshot_people(_roster_inputs())
    changed_people = build_snapshot_people(
        (
            *_roster_inputs()[:2],
            RosterAuthorizationInput(
                employee_no="300",
                display_name="员工甲",
                direct_manager_source_value="总监",
                hrbp_source_value="HRBP",
                employment_status="在职",
            ),
            *_roster_inputs()[3:],
        )
    )

    initial_employee = next(person for person in initial_people if person.employee_no == "300")
    changed_employee = next(person for person in changed_people if person.employee_no == "300")

    assert initial_employee.direct_manager_employee_no == "200"
    assert changed_employee.direct_manager_employee_no == "100"


def test_locked_snapshot_rejects_structural_sync():
    with pytest.raises(SnapshotLockedError):
        assert_snapshot_mutable(AUTHORIZATION_SNAPSHOT_STATUS_LOCKED)


def test_live_termination_sync_only_changes_employment_status():
    people = build_snapshot_people(_roster_inputs())
    updated_people = apply_live_employment_statuses(people, {"300": "离职"})
    original_employee = next(person for person in people if person.employee_no == "300")
    updated_employee = next(person for person in updated_people if person.employee_no == "300")

    assert updated_employee.employment_status == "离职"
    assert updated_employee.direct_manager_employee_no == original_employee.direct_manager_employee_no
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
