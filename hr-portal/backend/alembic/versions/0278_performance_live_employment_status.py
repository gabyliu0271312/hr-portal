"""Separate live employment status from cycle person snapshots."""
from alembic import op
import sqlalchemy as sa

revision = "0278_performance_live_status"
down_revision = "0277_performance_standard_position"
branch_labels = None
depends_on = None


def _replace_guard(*, allow_live_status: bool) -> None:
    allowed_fields = "'live_employment_status', 'updated_at'" if allow_live_status else "'employment_status', 'updated_at'"
    message = (
        "locked performance authorization snapshots only allow live employment status updates"
        if allow_live_status
        else "locked performance authorization snapshots only allow employment status updates"
    )
    op.execute(f"""
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
                IF (to_jsonb(NEW) - ARRAY[{allowed_fields}])
                   IS DISTINCT FROM (to_jsonb(OLD) - ARRAY[{allowed_fields}]) THEN
                    RAISE EXCEPTION '{message}';
                END IF;
            END IF;
            RETURN COALESCE(NEW, OLD);
        END;
        $$ LANGUAGE plpgsql;
    """)


def upgrade():
    op.add_column("performance_authorization_snapshot_people", sa.Column("live_employment_status", sa.String(64), nullable=True))
    _replace_guard(allow_live_status=True)
    op.execute("UPDATE performance_authorization_snapshot_people SET live_employment_status = employment_status")


def downgrade():
    _replace_guard(allow_live_status=False)
    op.drop_column("performance_authorization_snapshot_people", "live_employment_status")
