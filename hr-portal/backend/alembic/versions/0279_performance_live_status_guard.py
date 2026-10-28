"""Repair the locked snapshot guard for live employment status updates."""
from alembic import op

revision = "0279_performance_live_guard"
down_revision = "0278_performance_live_status"
branch_labels = None
depends_on = None


def upgrade():
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


def downgrade():
    pass
