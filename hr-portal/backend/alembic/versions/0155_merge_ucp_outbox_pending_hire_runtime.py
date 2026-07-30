"""merge UCP outbox and pending-hire runtime heads

Revision ID: 0155
Revises: 0152, 0154_pending_hire_report_field_mapping
Create Date: 2026-07-30
"""

revision = "0155"
down_revision = ("0152", "0154_pending_hire_report_field_mapping")
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
