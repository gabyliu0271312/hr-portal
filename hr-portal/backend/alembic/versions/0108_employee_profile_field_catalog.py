"""add employee profile field catalog settings

Revision ID: 0108
Revises: 0107
Create Date: 2026-07-22
"""
from alembic import op
import sqlalchemy as sa


revision = "0108"
down_revision = "0107"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "employee_profile_field_settings",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("table_name", sa.String(length=128), nullable=False),
        sa.Column("column_name", sa.String(length=128), nullable=False),
        sa.Column("field_code", sa.String(length=128), nullable=False),
        sa.Column("display_name", sa.String(length=64), nullable=False),
        sa.Column("is_default_card", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("default_display_order", sa.Integer(), nullable=True),
        sa.Column("append_display_order", sa.Integer(), nullable=False, server_default="999"),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("created_by", sa.BigInteger(), nullable=True),
        sa.Column("updated_by", sa.BigInteger(), nullable=True),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["updated_by"], ["users.id"], ondelete="SET NULL"),
        sa.UniqueConstraint("table_name", "column_name", name="uq_employee_profile_field_table_column"),
        sa.UniqueConstraint("table_name", "field_code", name="uq_employee_profile_field_table_code"),
    )
    op.create_index("ix_employee_profile_field_table_default", "employee_profile_field_settings", ["table_name", "is_default_card"])
    settings = sa.table(
        "employee_profile_field_settings",
        sa.column("table_name", sa.String()), sa.column("column_name", sa.String()), sa.column("field_code", sa.String()),
        sa.column("display_name", sa.String()), sa.column("is_default_card", sa.Boolean()),
        sa.column("default_display_order", sa.Integer()), sa.column("append_display_order", sa.Integer()), sa.column("version", sa.Integer()),
    )
    op.bulk_insert(settings, [
        {"table_name": "emp_realtime_roster", "column_name": "department", "field_code": "department", "display_name": "\u6240\u5c5e\u7ec4\u7ec7", "is_default_card": True, "default_display_order": 1, "append_display_order": 10, "version": 1},
        {"table_name": "emp_realtime_roster", "column_name": "hire_date", "field_code": "hire_date", "display_name": "\u5165\u804c\u65e5\u671f", "is_default_card": True, "default_display_order": 2, "append_display_order": 20, "version": 1},
        {"table_name": "emp_realtime_roster", "column_name": "employee_type", "field_code": "employee_type", "display_name": "\u5458\u5de5\u7c7b\u578b", "is_default_card": True, "default_display_order": 3, "append_display_order": 30, "version": 1},
        {"table_name": "emp_realtime_roster", "column_name": "standard_position", "field_code": "standard_position", "display_name": "\u6807\u51c6\u804c\u4f4d", "is_default_card": True, "default_display_order": 4, "append_display_order": 40, "version": 1},
        {"table_name": "emp_realtime_roster", "column_name": "position_level", "field_code": "position_level", "display_name": "\u5c97\u4f4d\u5c42\u7ea7", "is_default_card": True, "default_display_order": 5, "append_display_order": 50, "version": 1},
    ])


def downgrade() -> None:
    op.drop_index("ix_employee_profile_field_table_default", table_name="employee_profile_field_settings")
    op.drop_table("employee_profile_field_settings")
