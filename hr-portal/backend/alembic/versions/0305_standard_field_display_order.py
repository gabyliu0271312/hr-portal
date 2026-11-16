"""Add display_order to standard_fields for user-controlled field ordering."""
from alembic import op
import sqlalchemy as sa

revision = "0305_standard_field_display_order"
down_revision = "0304_cc_local_source_mode"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("standard_fields", sa.Column(
        "display_order", sa.Integer(), nullable=False, server_default="0",
    ))


def downgrade():
    raise RuntimeError("字段显示顺序由用户拖拽维护，不可自动降级")
