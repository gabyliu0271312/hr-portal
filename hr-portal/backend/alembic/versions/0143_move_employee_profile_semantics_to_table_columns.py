"""move employee profile semantic definitions to standard table columns

Revision ID: 0143
Revises: 0142
Create Date: 2026-07-28 14:10:00
"""

from alembic import op


revision = "0143"
down_revision = "0142"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        UPDATE table_columns AS column_metadata
        SET description = field_settings.semantic_description
        FROM employee_profile_field_settings AS field_settings
        WHERE field_settings.table_name = 'emp_realtime_roster'
          AND field_settings.column_name = column_metadata.column_code
          AND column_metadata.table_name = field_settings.table_name
          AND field_settings.semantic_description <> ''
          AND COALESCE(column_metadata.description, '') = ''
        """
    )


def downgrade() -> None:
    pass
