"""Operator-saved employees for quick identity switching."""
from alembic import op
import sqlalchemy as sa

revision = "0286_identity_switch_favorites"
down_revision = "0285_master_data_module_menus"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "app_identity_switch_favorites",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("operator_user_id", sa.BigInteger(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("employee_no", sa.String(64), nullable=False),
        sa.Column("display_name", sa.String(128), nullable=False),
        sa.Column("organization_label", sa.String(255)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("operator_user_id", "employee_no", name="uq_identity_switch_favorites_operator_employee"),
    )
    op.create_index(
        "ix_app_identity_switch_favorites_operator_user_id",
        "app_identity_switch_favorites",
        ["operator_user_id"],
    )


def downgrade():
    op.drop_index("ix_app_identity_switch_favorites_operator_user_id", table_name="app_identity_switch_favorites")
    op.drop_table("app_identity_switch_favorites")
