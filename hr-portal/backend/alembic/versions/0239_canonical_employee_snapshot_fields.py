"""Canonicalize employee fields across performance snapshots."""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0239_canonical_employee_snapshot_fields"
down_revision: Union[str, None] = "0238_performance_subject_visibility_settings"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _has_table(name: str) -> bool:
    return sa.inspect(op.get_bind()).has_table(name)


def upgrade() -> None:
    op.alter_column("performance_authorization_snapshot_people", "direct_manager_employee_no", new_column_name="direct_supervisor_employee_no")
    op.alter_column("performance_authorization_snapshot_people", "direct_manager_source_value", new_column_name="direct_supervisor_source_value")
    op.execute("ALTER INDEX IF EXISTS ix_performance_authorization_snapshot_people_manager RENAME TO ix_performance_authorization_snapshot_people_supervisor")
    for name, column_type in (
        ("employee_type", sa.String(length=64)),
        ("job_family", sa.String(length=128)),
        ("job_category", sa.String(length=128)),
        ("position_level", sa.String(length=128)),
        ("hire_date", sa.Date()),
    ):
        op.add_column("performance_authorization_snapshot_people", sa.Column(name, column_type, nullable=True))

    op.alter_column("performance_project_members", "direct_manager_employee_no", new_column_name="direct_supervisor_employee_no")
    op.add_column("performance_project_members", sa.Column("employee_type", sa.String(length=64), nullable=True))
    op.add_column("performance_project_members", sa.Column("job_family", sa.String(length=128), nullable=True))
    op.add_column("performance_project_members", sa.Column("job_category", sa.String(length=128), nullable=True))
    op.alter_column("performance_project_members", "level", new_column_name="position_level")
    op.alter_column("performance_project_members", "entry_date", new_column_name="hire_date")
    op.drop_column("performance_project_members", "sequence")

    op.alter_column("performance_publication_transfers", "original_direct_manager_employee_no", new_column_name="original_direct_supervisor_employee_no")

    if _has_table("emp_realtime_roster"):
        op.execute("ALTER TABLE performance_authorization_snapshot_people DISABLE TRIGGER trg_performance_snapshot_people_locked_guard")
        op.execute(sa.text("""
            UPDATE performance_authorization_snapshot_people AS target
            SET direct_supervisor_source_value = NULLIF(btrim(roster.direct_supervisor), ''),
                employee_type = roster.employee_type,
                job_family = roster.job_family,
                job_category = roster.job_category,
                position_level = roster.position_level,
                hire_date = roster.hire_date
            FROM emp_realtime_roster AS roster
            WHERE target.employee_no = roster.employee_no::text
        """))
        op.execute(sa.text("""
            UPDATE performance_authorization_snapshot_people AS target
            SET direct_supervisor_employee_no = COALESCE(
                (
                    SELECT supervisor.employee_no::text
                    FROM emp_realtime_roster AS supervisor
                    WHERE supervisor.employee_no::text = target.direct_supervisor_source_value
                    LIMIT 1
                ),
                (
                    SELECT CASE WHEN count(*) = 1 THEN min(supervisor.employee_no::text) END
                    FROM emp_realtime_roster AS supervisor
                    WHERE btrim(supervisor.full_name) = target.direct_supervisor_source_value
                )
            )
        """))
        op.execute(sa.text("""
            UPDATE performance_project_members AS target
            SET employee_type = roster.employee_type,
                job_family = roster.job_family,
                job_category = roster.job_category,
                position_level = roster.position_level,
                hire_date = roster.hire_date
            FROM emp_realtime_roster AS roster
            WHERE target.employee_no = roster.employee_no::text
        """))
        op.execute(sa.text("""
            UPDATE performance_project_members AS target
            SET direct_supervisor_employee_no = source.direct_supervisor_employee_no
            FROM performance_project_member_snapshots AS snapshot,
                 performance_authorization_snapshot_people AS source
            WHERE target.snapshot_id = snapshot.id
              AND source.snapshot_id = snapshot.source_snapshot_id
              AND source.employee_no = target.employee_no
        """))
        op.execute("ALTER TABLE performance_authorization_snapshot_people ENABLE TRIGGER trg_performance_snapshot_people_locked_guard")

    if _has_table("performance_subject_visibility_settings"):
        op.execute("DELETE FROM performance_subject_visibility_settings")


def downgrade() -> None:
    op.alter_column("performance_publication_transfers", "original_direct_supervisor_employee_no", new_column_name="original_direct_manager_employee_no")

    op.add_column("performance_project_members", sa.Column("sequence", sa.String(length=128), nullable=True))
    op.execute(sa.text("""
        UPDATE performance_project_members
        SET sequence = NULLIF(concat_ws('-', NULLIF(btrim(job_family), ''), NULLIF(btrim(job_category), '')), '')
    """))
    op.alter_column("performance_project_members", "hire_date", new_column_name="entry_date")
    op.alter_column("performance_project_members", "position_level", new_column_name="level")
    op.drop_column("performance_project_members", "job_category")
    op.drop_column("performance_project_members", "job_family")
    op.drop_column("performance_project_members", "employee_type")
    op.alter_column("performance_project_members", "direct_supervisor_employee_no", new_column_name="direct_manager_employee_no")

    for name in ("hire_date", "position_level", "job_category", "job_family", "employee_type"):
        op.drop_column("performance_authorization_snapshot_people", name)
    op.execute("ALTER INDEX IF EXISTS ix_performance_authorization_snapshot_people_supervisor RENAME TO ix_performance_authorization_snapshot_people_manager")
    op.alter_column("performance_authorization_snapshot_people", "direct_supervisor_source_value", new_column_name="direct_manager_source_value")
    op.alter_column("performance_authorization_snapshot_people", "direct_supervisor_employee_no", new_column_name="direct_manager_employee_no")
