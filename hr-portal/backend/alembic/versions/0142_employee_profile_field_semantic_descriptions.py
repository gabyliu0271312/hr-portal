"""add employee profile field semantic descriptions

Revision ID: 0142
Revises: 0141
Create Date: 2026-07-28 13:45:00
"""

from alembic import op
import sqlalchemy as sa


revision = "0142"
down_revision = "0141"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "employee_profile_field_settings",
        sa.Column(
            "semantic_description",
            sa.String(length=500),
            nullable=False,
            server_default="",
        ),
    )
    op.execute(
        sa.text(
            "UPDATE employee_profile_field_settings "
            "SET semantic_description = :description "
            "WHERE table_name = :table_name AND column_name = :column_name"
        ).bindparams(
            description="\u5458\u5de5\u56fa\u5b9a\u7684\u57fa\u672c\u85aa\u916c\uff0c\u4e0d\u7b49\u4e8e\u5c97\u4f4d\u5de5\u8d44\u3002",
            table_name="emp_realtime_roster",
            column_name="base_salary",
        )
    )
    op.execute(
        sa.text(
            "UPDATE employee_profile_field_settings "
            "SET semantic_description = :description "
            "WHERE table_name = :table_name AND column_name = :column_name"
        ).bindparams(
            description="\u4e0e\u5c97\u4f4d\u76f8\u5173\u7684\u5c97\u4f4d\u5de5\u8d44\uff0c\u4e0d\u7b49\u4e8e\u57fa\u672c\u5de5\u8d44\u3002",
            table_name="emp_realtime_roster",
            column_name="position_salary",
        )
    )
    op.alter_column(
        "employee_profile_field_settings",
        "semantic_description",
        server_default=None,
    )


def downgrade() -> None:
    op.drop_column("employee_profile_field_settings", "semantic_description")
