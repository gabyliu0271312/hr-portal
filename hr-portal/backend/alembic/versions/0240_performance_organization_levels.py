"""Persist the six source organization levels in performance snapshots."""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0240_performance_organization_levels"
down_revision: Union[str, None] = "0239_canonical_employee_snapshot_fields"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_LEVELS = ("company_org", "department", "department_2", "department_3", "department_4", "department_5")
_CYCLE = "performance_authorization_snapshot_people"
_PROJECT = "performance_project_members"
_GUARD = "trg_performance_snapshot_people_locked_guard"


def upgrade() -> None:
    for table in (_CYCLE, _PROJECT):
        for field in _LEVELS:
            op.add_column(table, sa.Column(field, sa.String(256), nullable=True))
        op.alter_column(table, "organization_ref", existing_type=sa.String(128), type_=sa.String(1536))

    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if inspector.has_table("emp_realtime_roster"):
        missing = set((*_LEVELS, "employee_no")) - {item["name"] for item in inspector.get_columns("emp_realtime_roster")}
        if missing:
            raise RuntimeError(f"员工实时花名册缺少组织字段: {', '.join(sorted(missing))}")
        op.execute(f"ALTER TABLE {_CYCLE} DISABLE TRIGGER {_GUARD}")
        assignments = ", ".join(f"{field} = NULLIF(btrim(roster.{field}), '')" for field in _LEVELS)
        op.execute(sa.text(f"""
            UPDATE {_CYCLE} AS target
            SET {assignments}
            FROM emp_realtime_roster AS roster
            WHERE target.employee_no = roster.employee_no::text
        """))
    else:
        op.execute(f"ALTER TABLE {_CYCLE} DISABLE TRIGGER {_GUARD}")

    # Development-only rows without a current roster record retain their historical top-level value.
    op.execute(sa.text(f"""
        UPDATE {_CYCLE}
        SET company_org = NULLIF(btrim(organization_ref), '')
        WHERE company_org IS NULL AND organization_ref IS NOT NULL
    """))
    _set_paths(_CYCLE)
    op.execute(f"ALTER TABLE {_CYCLE} ENABLE TRIGGER {_GUARD}")

    op.execute(sa.text(f"""
        UPDATE {_PROJECT} AS target
        SET {', '.join(f'{field} = source.{field}' for field in _LEVELS)},
            organization_ref = source.organization_ref
        FROM performance_project_member_snapshots AS snapshot,
             {_CYCLE} AS source
        WHERE target.snapshot_id = snapshot.id
          AND source.snapshot_id = snapshot.source_snapshot_id
          AND source.employee_no = target.employee_no
    """))


def _set_paths(table: str) -> None:
    parts = ", ".join(f"NULLIF(btrim({field}), '')" for field in _LEVELS)
    op.execute(sa.text(f"UPDATE {table} SET organization_ref = NULLIF(concat_ws('/', {parts}), '')"))


def downgrade() -> None:
    op.execute(f"ALTER TABLE {_CYCLE} DISABLE TRIGGER {_GUARD}")
    for table in (_PROJECT, _CYCLE):
        op.execute(sa.text(f"UPDATE {table} SET organization_ref = company_org"))
        for field in reversed(_LEVELS):
            op.drop_column(table, field)
        op.alter_column(table, "organization_ref", existing_type=sa.String(1536), type_=sa.String(128))
    op.execute(f"ALTER TABLE {_CYCLE} ENABLE TRIGGER {_GUARD}")
