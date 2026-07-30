"""relax legacy pending employee application id constraint

Revision ID: 0146_pending_employee_dynamic_schema
Revises: 0145_pending_employee_pk_hash
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0146_pending_employee_dynamic_schema"
down_revision = "0145_pending_employee_pk_hash"
branch_labels = None
depends_on = None


TABLE_NAME = "hr_pending_employee_full"
LEGACY_APPLICATION_ID_CONSTRAINT = "uq_pending_employee_application_id"


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if TABLE_NAME not in inspector.get_table_names():
        return

    constraints = {item["name"] for item in inspector.get_unique_constraints(TABLE_NAME)}
    if LEGACY_APPLICATION_ID_CONSTRAINT in constraints:
        op.drop_constraint(LEGACY_APPLICATION_ID_CONSTRAINT, TABLE_NAME, type_="unique")

    columns = {item["name"]: item for item in inspector.get_columns(TABLE_NAME)}
    if "application_id" in columns and not columns["application_id"]["nullable"]:
        op.alter_column(
            TABLE_NAME,
            "application_id",
            existing_type=sa.String(length=64),
            nullable=True,
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if TABLE_NAME not in inspector.get_table_names():
        return

    null_count = bind.execute(
        sa.text(f"SELECT count(*) FROM {TABLE_NAME} WHERE application_id IS NULL")
    ).scalar_one()
    if null_count:
        raise RuntimeError(
            "无法降级：hr_pending_employee_full 已包含未维护 application_id 的动态同步记录"
        )

    constraints = {item["name"] for item in inspector.get_unique_constraints(TABLE_NAME)}
    if LEGACY_APPLICATION_ID_CONSTRAINT not in constraints:
        op.create_unique_constraint(LEGACY_APPLICATION_ID_CONSTRAINT, TABLE_NAME, ["application_id"])
    op.alter_column(
        TABLE_NAME,
        "application_id",
        existing_type=sa.String(length=64),
        nullable=False,
    )
