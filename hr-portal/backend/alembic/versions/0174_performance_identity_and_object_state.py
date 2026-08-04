"""Persist performance identity links and object authorization state.

Revision ID: 0174_performance_identity_and_object_state
Revises: 0173_performance_snapshot_lock_guards
Create Date: 2026-08-04
"""
from alembic import op
import sqlalchemy as sa


revision = "0174_performance_identity_and_object_state"
down_revision = "0173_performance_snapshot_lock_guards"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("performance_authorization_snapshot_people", sa.Column("portal_user_id", sa.BigInteger(), nullable=True))
    op.create_unique_constraint("uq_performance_authorization_snapshot_portal_user", "performance_authorization_snapshot_people", ["snapshot_id", "portal_user_id"])
    op.create_table("performance_identity_links", sa.Column("id", sa.BigInteger(), primary_key=True), sa.Column("portal_user_id", sa.BigInteger(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False), sa.Column("employee_no", sa.String(64), nullable=False), sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()), sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")), sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")), sa.UniqueConstraint("portal_user_id", name="uq_performance_identity_link_portal_user"), sa.UniqueConstraint("employee_no", name="uq_performance_identity_link_employee"))
    op.create_table("performance_object_authorization_states", sa.Column("id", sa.BigInteger(), primary_key=True), sa.Column("snapshot_id", sa.BigInteger(), sa.ForeignKey("performance_authorization_snapshots.id", ondelete="CASCADE"), nullable=False), sa.Column("employee_no", sa.String(64), nullable=False), sa.Column("cycle_status", sa.String(32), nullable=False), sa.Column("node_status", sa.String(32), nullable=False), sa.Column("record_status", sa.String(32), nullable=False), sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")), sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")), sa.UniqueConstraint("snapshot_id", "employee_no", name="uq_performance_object_authorization_state"))


def downgrade() -> None:
    op.drop_table("performance_object_authorization_states")
    op.drop_table("performance_identity_links")
    op.drop_constraint("uq_performance_authorization_snapshot_portal_user", "performance_authorization_snapshot_people", type_="unique")
    op.drop_column("performance_authorization_snapshot_people", "portal_user_id")
