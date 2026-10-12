"""Persist table safety classification without changing query authorization."""
from alembic import op
import sqlalchemy as sa

revision = "0253_table_scope_classification"
down_revision = "0252_performance_metric_field_display_ids"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("registered_tables", sa.Column(
        "security_classification", sa.String(32), nullable=False, server_default="controlled_fact"
    ))
    op.add_column("registered_tables", sa.Column(
        "scope_classification_version", sa.Integer(), nullable=False, server_default="0"
    ))
    op.add_column("registered_tables", sa.Column("scope_approved_by", sa.BigInteger(), nullable=True))
    op.add_column("registered_tables", sa.Column("scope_approved_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("registered_tables", sa.Column("scope_approval_reason", sa.Text(), nullable=True))
    op.create_foreign_key(
        "fk_registered_table_scope_approved_by", "registered_tables", "users",
        ["scope_approved_by"], ["id"], ondelete="RESTRICT"
    )
    op.create_check_constraint(
        "ck_registered_table_security_classification", "registered_tables",
        "security_classification IN ('controlled_fact','sensitive_fact','person_bridge','public_reference')"
    )
    op.create_check_constraint(
        "ck_registered_table_scope_approval", "registered_tables",
        "(scope_classification_version = 0 AND security_classification = 'controlled_fact' "
        "AND scope_approved_by IS NULL AND scope_approved_at IS NULL AND scope_approval_reason IS NULL) "
        "OR (scope_classification_version > 0 AND scope_approved_by IS NOT NULL "
        "AND scope_approved_at IS NOT NULL AND scope_approval_reason IS NOT NULL "
        "AND length(trim(scope_approval_reason)) > 0)"
    )


def downgrade():
    op.drop_constraint("ck_registered_table_scope_approval", "registered_tables", type_="check")
    op.drop_constraint("ck_registered_table_security_classification", "registered_tables", type_="check")
    op.drop_constraint("fk_registered_table_scope_approved_by", "registered_tables", type_="foreignkey")
    for column in (
        "scope_approval_reason", "scope_approved_at", "scope_approved_by",
        "scope_classification_version", "security_classification",
    ):
        op.drop_column("registered_tables", column)
