"""Enable verified capabilities for already-published operations.

Revision ID: 0140
Revises: 0139
"""
from alembic import op

revision = "0140"
down_revision = "0139"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        UPDATE ucp_system_capability AS capability
        SET enabled = true
        FROM ucp_operation_definition AS operation
        WHERE capability.operation_id = operation.id
          AND capability.enabled = false
          AND capability.credential_id IS NOT NULL
          AND capability.verification_status = 'VERIFIED'
          AND capability.connection_status = 'CONNECTED'
          AND operation.status = 'PUBLISHED'
          AND operation.approval_status = 'PUBLISHED'
    """)


def downgrade() -> None:
    pass
