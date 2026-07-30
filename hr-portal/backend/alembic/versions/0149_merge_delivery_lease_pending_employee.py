"""merge UCP delivery lease and pending employee schema heads

Revision ID: 0149
Revises: 0148, 0146_pending_employee_dynamic_schema
Create Date: 2026-07-30
"""

revision = "0149"
down_revision = ("0148", "0146_pending_employee_dynamic_schema")
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
