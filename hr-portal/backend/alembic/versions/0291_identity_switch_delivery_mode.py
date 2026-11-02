"""Add global notification delivery_mode to identity switch settings."""
from alembic import op
import sqlalchemy as sa

revision = "0291_identity_switch_delivery_mode"
down_revision = "0290_pm_task_authorizations"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "app_identity_switch_settings",
        sa.Column("delivery_mode", sa.String(16), nullable=False, server_default="blocked"),
    )
    op.create_check_constraint(
        "ck_identity_switch_delivery_mode",
        "app_identity_switch_settings",
        "delivery_mode IN ('blocked', 'test_receiver', 'normal')",
    )


def downgrade():
    op.drop_constraint("ck_identity_switch_delivery_mode", "app_identity_switch_settings", type_="check")
    op.drop_column("app_identity_switch_settings", "delivery_mode")
