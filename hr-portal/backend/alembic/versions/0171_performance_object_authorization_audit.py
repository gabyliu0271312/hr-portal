"""Add performance object-authorization audit and publication transfers.

Revision ID: 0171_performance_object_authorization_audit
Revises: 0170_performance_authorization_snapshots
Create Date: 2026-08-04
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0171_performance_object_authorization_audit"
down_revision = "0170_performance_authorization_snapshots"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "performance_publication_transfers",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("cycle_ref", sa.String(length=64), nullable=False),
        sa.Column("employee_no", sa.String(length=64), nullable=False),
        sa.Column("original_direct_manager_employee_no", sa.String(length=64), nullable=False),
        sa.Column("transferred_by_type", sa.String(length=32), nullable=False),
        sa.Column("transferred_by_ref", sa.String(length=64), nullable=False),
        sa.Column("recipient_type", sa.String(length=32), nullable=False),
        sa.Column("recipient_ref", sa.String(length=64), nullable=False),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("transferred_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.CheckConstraint(
            "transferred_by_type IN ('EMPLOYEE', 'PORTAL_USER', 'SYSTEM_ACCOUNT')",
            name="ck_performance_publication_transfer_actor_type",
        ),
        sa.CheckConstraint(
            "recipient_type IN ('EMPLOYEE', 'PORTAL_USER', 'SYSTEM_ACCOUNT')",
            name="ck_performance_publication_transfer_recipient_type",
        ),
    )
    op.create_index(
        "uq_performance_publication_transfer_active_target",
        "performance_publication_transfers",
        ["cycle_ref", "employee_no"],
        unique=True,
        postgresql_where=sa.text("is_active = true"),
    )
    op.create_index(
        "ix_performance_publication_transfer_recipient",
        "performance_publication_transfers",
        ["cycle_ref", "recipient_type", "recipient_ref", "is_active"],
    )

    op.create_table(
        "performance_audit_events",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("event_type", sa.String(length=64), nullable=False),
        sa.Column("cycle_ref", sa.String(length=64), nullable=True),
        sa.Column("employee_no", sa.String(length=64), nullable=True),
        sa.Column("actor_type", sa.String(length=32), nullable=False),
        sa.Column("actor_ref", sa.String(length=64), nullable=False),
        sa.Column("subject_type", sa.String(length=32), nullable=True),
        sa.Column("subject_ref", sa.String(length=64), nullable=True),
        sa.Column("before_state", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("after_state", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("event_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index(
        "ix_performance_audit_event_cycle_employee",
        "performance_audit_events",
        ["cycle_ref", "employee_no", "event_at"],
    )
    op.create_index(
        "ix_performance_audit_event_type",
        "performance_audit_events",
        ["event_type", "event_at"],
    )
    op.execute(
        """
        CREATE FUNCTION performance_reject_audit_event_mutation()
        RETURNS trigger AS $$
        BEGIN
            RAISE EXCEPTION 'performance audit events are immutable';
        END;
        $$ LANGUAGE plpgsql;
        """
    )
    op.execute(
        """
        CREATE TRIGGER trg_performance_audit_events_immutable
        BEFORE UPDATE OR DELETE ON performance_audit_events
        FOR EACH ROW EXECUTE FUNCTION performance_reject_audit_event_mutation();
        """
    )


def downgrade() -> None:
    op.execute("DROP TRIGGER trg_performance_audit_events_immutable ON performance_audit_events")
    op.execute("DROP FUNCTION performance_reject_audit_event_mutation()")
    op.drop_index("ix_performance_audit_event_type", table_name="performance_audit_events")
    op.drop_index("ix_performance_audit_event_cycle_employee", table_name="performance_audit_events")
    op.drop_table("performance_audit_events")
    op.drop_index(
        "ix_performance_publication_transfer_recipient",
        table_name="performance_publication_transfers",
    )
    op.drop_index(
        "uq_performance_publication_transfer_active_target",
        table_name="performance_publication_transfers",
    )
    op.drop_table("performance_publication_transfers")