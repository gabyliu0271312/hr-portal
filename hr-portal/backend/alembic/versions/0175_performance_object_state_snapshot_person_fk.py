"""Require object authorization states to reference snapshot people.

Revision ID: 0175_performance_object_state_snapshot_person_fk
Revises: 0174_performance_identity_and_object_state
Create Date: 2026-08-04
"""
from alembic import op


revision = "0175_performance_object_state_snapshot_person_fk"
down_revision = "0174_performance_identity_and_object_state"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("DELETE FROM performance_object_authorization_states state WHERE NOT EXISTS (SELECT 1 FROM performance_authorization_snapshot_people person WHERE person.snapshot_id = state.snapshot_id AND person.employee_no = state.employee_no)")
    op.create_foreign_key("fk_performance_object_authorization_state_snapshot_person", "performance_object_authorization_states", "performance_authorization_snapshot_people", ["snapshot_id", "employee_no"], ["snapshot_id", "employee_no"], ondelete="CASCADE")


def downgrade() -> None:
    op.drop_constraint("fk_performance_object_authorization_state_snapshot_person", "performance_object_authorization_states", type_="foreignkey")
