"""Version cycle lock policies and scope controlled pre-start people maintenance."""
from alembic import op
import sqlalchemy as sa

revision = "0321_pm_pre_lock_adjustment"
down_revision = "0320_pm_column_preferences"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("performance_cycles", sa.Column("pre_lock_adjust_until", sa.DateTime(timezone=True), nullable=True))
    op.add_column("performance_cycles", sa.Column("lock_policy_version", sa.Integer(), nullable=False, server_default="1"))
    op.add_column("performance_cycles", sa.Column("pre_lock_adjusted_on", sa.Date(), nullable=True))
    op.add_column("performance_cycles", sa.Column("member_info_frozen_at", sa.DateTime(timezone=True), nullable=True))
    op.create_check_constraint("ck_pm_cycle_lock_policy", "performance_cycles", "lock_policy_version IN (1,2)")
    op.create_check_constraint("ck_pm_cycle_adjust_until", "performance_cycles", "lock_policy_version = 1 OR (CASE WHEN lock_rule = 'SCHEDULED' AND pre_lock_sync_mode = 'AUTO_DAILY' THEN pre_lock_adjust_until IS NOT NULL AND pre_lock_adjust_until <= lock_at ELSE pre_lock_adjust_until IS NULL END)")
    op.execute("""
        CREATE OR REPLACE FUNCTION performance_guard_snapshot_person_mutation()
        RETURNS trigger AS $$
        DECLARE
            snapshot_locked boolean;
            old_snapshot_locked boolean;
            guard jsonb;
            cycle_guard jsonb;
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
                cycle_guard := NULLIF(current_setting('performance.cycle_people_update', true), '')::jsonb;
                IF cycle_guard IS NOT NULL AND EXISTS (
                    SELECT 1 FROM performance_authorization_snapshots s
                    JOIN performance_cycles c ON c.cycle_ref = s.cycle_ref
                    WHERE s.id = COALESCE(NEW.snapshot_id, OLD.snapshot_id)
                      AND c.cycle_ref = cycle_guard->>'cycle_ref'
                      AND c.start_at > CURRENT_TIMESTAMP
                ) AND (TG_OP <> 'UPDATE' OR (NEW.snapshot_id = OLD.snapshot_id AND NEW.id = OLD.id)) THEN
                    RETURN COALESCE(NEW, OLD);
                END IF;
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
    op.execute("""DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM performance_cycles WHERE lock_policy_version = 2) THEN
            RAISE EXCEPTION 'cannot discard version 2 cycle lock policies';
        END IF;
    END $$;""")
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
    op.drop_constraint("ck_pm_cycle_adjust_until", "performance_cycles", type_="check")
    op.drop_constraint("ck_pm_cycle_lock_policy", "performance_cycles", type_="check")
    for field in ("member_info_frozen_at", "pre_lock_adjusted_on", "lock_policy_version", "pre_lock_adjust_until"):
        op.drop_column("performance_cycles", field)
