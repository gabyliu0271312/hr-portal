"""Freeze roster profile fields into project member snapshots."""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0235_project_member_profile_snapshot"
down_revision: Union[str, None] = "0234_merge_performance_settings_and_hrbp"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("performance_project_members", sa.Column("sequence", sa.String(128), nullable=True))
    op.add_column("performance_project_members", sa.Column("level", sa.String(128), nullable=True))
    op.add_column("performance_project_members", sa.Column("entry_date", sa.Date(), nullable=True))

    bind = op.get_bind()
    from app.data.models import DATA_TABLES

    roster_model = DATA_TABLES.get("emp_realtime_roster")
    if roster_model is None:
        return
    roster = roster_model.__table__
    employee_no = next((roster.c[name] for name in ("employee_no", "employee_id", "工号") if name in roster.c), None)
    hire_date = next((roster.c[name] for name in ("hire_date", "入职日期") if name in roster.c), None)
    position_level = next((roster.c[name] for name in ("position_level", "岗位层级") if name in roster.c), None)
    job_category = next((roster.c[name] for name in ("job_category", "职位序列") if name in roster.c), None)
    if employee_no is None:
        return
    columns = [employee_no.label("employee_no")]
    if hire_date is not None:
        columns.append(hire_date.label("entry_date"))
    if position_level is not None:
        columns.append(position_level.label("level"))
    if job_category is not None:
        columns.append(job_category.label("sequence"))
    rows = bind.execute(sa.select(*columns)).mappings().all()
    values = {str(row["employee_no"]): dict(row) for row in rows}
    members = sa.table(
        "performance_project_members",
        sa.column("id"),
        sa.column("employee_no"),
    )
    for member in bind.execute(sa.select(members.c.id, members.c.employee_no)).mappings():
        profile = values.get(str(member["employee_no"]))
        if profile is None:
            continue
        bind.execute(
            sa.text(
                "UPDATE performance_project_members "
                "SET sequence = :sequence, level = :level, entry_date = :entry_date "
                "WHERE id = :id"
            ),
            {
                "id": member["id"],
                "sequence": str(profile.get("sequence") or "") or None,
                "level": str(profile.get("level") or "") or None,
                "entry_date": profile.get("entry_date"),
            },
        )


def downgrade() -> None:
    op.drop_column("performance_project_members", "entry_date")
    op.drop_column("performance_project_members", "level")
    op.drop_column("performance_project_members", "sequence")
