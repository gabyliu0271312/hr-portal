"""Allow scoped single-person dimension updates without unlocking snapshots."""
from alembic import op

revision = "0294_pm_person_info_guard"
down_revision = "0293_performance_calibration_revocation"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("""
        CREATE OR REPLACE FUNCTION performance_guard_snapshot_person_mutation()
        RETURNS trigger AS $$
        DECLARE
            snapshot_locked boolean;
            old_snapshot_locked boolean;
            guard jsonb;
            allowed_fields text[];
            dimension_fields constant text[] := ARRAY[
                'job_family', 'position_level', 'direct_supervisor_employee_no',
                'direct_supervisor_source_value', 'company_org', 'department',
                'department_2', 'department_3', 'department_4', 'department_5',
                'organization_ref', 'is_manually_maintained'
            ];
        BEGIN
            SELECT status = 'LOCKED' INTO snapshot_locked
            FROM performance_authorization_snapshots
            WHERE id = COALESCE(NEW.snapshot_id, OLD.snapshot_id);
            IF TG_OP = 'UPDATE' THEN
                SELECT status = 'LOCKED' INTO old_snapshot_locked
                FROM performance_authorization_snapshots WHERE id = OLD.snapshot_id;
            END IF;
            IF COALESCE(snapshot_locked, false) OR COALESCE(old_snapshot_locked, false) THEN
                IF TG_OP IN ('INSERT', 'DELETE') THEN
                    RAISE EXCEPTION 'locked performance authorization snapshots cannot change people';
                END IF;
                IF (to_jsonb(NEW) - ARRAY['live_employment_status', 'updated_at'])
                   IS NOT DISTINCT FROM (to_jsonb(OLD) - ARRAY['live_employment_status', 'updated_at']) THEN
                    RETURN NEW;
                END IF;
                guard := NULLIF(current_setting('performance.person_info_update', true), '')::jsonb;
                IF guard IS NOT NULL
                   AND guard->>'snapshot_id' = OLD.snapshot_id::text
                   AND guard->>'person_id' = OLD.id::text
                   AND NEW.snapshot_id = OLD.snapshot_id AND NEW.id = OLD.id
                   AND jsonb_typeof(guard->'fields') = 'array' THEN
                    SELECT array_agg(value) INTO allowed_fields
                    FROM jsonb_array_elements_text(guard->'fields');
                    IF COALESCE(array_length(allowed_fields, 1), 0) > 0
                       AND allowed_fields <@ dimension_fields
                       AND (to_jsonb(NEW) - (allowed_fields || ARRAY['updated_at']))
                           IS NOT DISTINCT FROM
                           (to_jsonb(OLD) - (allowed_fields || ARRAY['updated_at'])) THEN
                        RETURN NEW;
                    END IF;
                END IF;
                RAISE EXCEPTION 'locked performance authorization snapshots only allow scoped person info updates';
            END IF;
            RETURN COALESCE(NEW, OLD);
        END;
        $$ LANGUAGE plpgsql;
    """)


def downgrade():
    op.execute("""
        CREATE OR REPLACE FUNCTION performance_guard_snapshot_person_mutation()
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
                IF (to_jsonb(NEW) - ARRAY['live_employment_status', 'updated_at'])
                   IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['live_employment_status', 'updated_at']) THEN
                    RAISE EXCEPTION 'locked performance authorization snapshots only allow live employment status updates';
                END IF;
            END IF;
            RETURN COALESCE(NEW, OLD);
        END;
        $$ LANGUAGE plpgsql;
    """)
