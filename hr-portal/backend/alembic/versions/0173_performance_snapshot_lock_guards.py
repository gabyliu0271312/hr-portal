"""Add database guards for locked performance authorization snapshots.

Revision ID: 0173_performance_snapshot_lock_guards
Revises: 0172_performance_feature_authorization_baseline
Create Date: 2026-08-04
"""
from alembic import op


revision = "0173_performance_snapshot_lock_guards"
down_revision = "0172_performance_feature_authorization_baseline"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE FUNCTION performance_guard_snapshot_person_mutation()
        RETURNS trigger AS $$
        DECLARE
            snapshot_locked boolean;
        BEGIN
            SELECT status = 'LOCKED' INTO snapshot_locked
            FROM performance_authorization_snapshots
            WHERE id = COALESCE(NEW.snapshot_id, OLD.snapshot_id);
            IF COALESCE(snapshot_locked, false) THEN
                IF TG_OP IN ('INSERT', 'DELETE') THEN
                    RAISE EXCEPTION 'locked performance authorization snapshots cannot change people';
                END IF;
                IF (to_jsonb(NEW) - ARRAY['employment_status', 'updated_at'])
                   IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['employment_status', 'updated_at']) THEN
                    RAISE EXCEPTION 'locked performance authorization snapshots only allow employment status updates';
                END IF;
            END IF;
            RETURN COALESCE(NEW, OLD);
        END;
        $$ LANGUAGE plpgsql;
        """
    )
    op.execute(
        """
        CREATE TRIGGER trg_performance_snapshot_people_locked_guard
        BEFORE INSERT OR UPDATE OR DELETE ON performance_authorization_snapshot_people
        FOR EACH ROW EXECUTE FUNCTION performance_guard_snapshot_person_mutation();
        """
    )
    op.execute(
        """
        CREATE FUNCTION performance_guard_dynamic_identity_mutation()
        RETURNS trigger AS $$
        DECLARE
            snapshot_locked boolean;
        BEGIN
            SELECT status = 'LOCKED' INTO snapshot_locked
            FROM performance_authorization_snapshots
            WHERE id = COALESCE(NEW.snapshot_id, OLD.snapshot_id);
            IF COALESCE(snapshot_locked, false) THEN
                RAISE EXCEPTION 'locked performance authorization snapshots cannot change dynamic identities';
            END IF;
            RETURN COALESCE(NEW, OLD);
        END;
        $$ LANGUAGE plpgsql;
        """
    )
    op.execute(
        """
        CREATE TRIGGER trg_performance_dynamic_identities_locked_guard
        BEFORE INSERT OR UPDATE OR DELETE ON performance_dynamic_identity_assignments
        FOR EACH ROW EXECUTE FUNCTION performance_guard_dynamic_identity_mutation();
        """
    )


def downgrade() -> None:
    op.execute(
        "DROP TRIGGER trg_performance_dynamic_identities_locked_guard "
        "ON performance_dynamic_identity_assignments"
    )
    op.execute("DROP FUNCTION performance_guard_dynamic_identity_mutation()")
    op.execute(
        "DROP TRIGGER trg_performance_snapshot_people_locked_guard "
        "ON performance_authorization_snapshot_people"
    )
    op.execute("DROP FUNCTION performance_guard_snapshot_person_mutation()")
