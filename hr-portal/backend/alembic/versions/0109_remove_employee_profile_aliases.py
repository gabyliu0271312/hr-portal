"""remove employee profile legacy aliases

Revision ID: 0109
Revises: 0108
Create Date: 2026-07-22
"""
from alembic import op

revision = "0109"
down_revision = "0108"
branch_labels = None
depends_on = None

def upgrade() -> None:
    op.execute("DROP TABLE IF EXISTS employee_profile_field_aliases")

def downgrade() -> None:
    pass
