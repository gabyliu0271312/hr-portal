"""merge transactional outbox and pending-hire repair heads

Revision ID: 0152
Revises: 0150, 0151_pending_hire_template_field_codes
Create Date: 2026-07-30
"""

revision = "0152"
down_revision = ("0150", "0151_pending_hire_template_field_codes")
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
