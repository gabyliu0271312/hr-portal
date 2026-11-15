"""Persist cost-center write ownership without changing existing identities."""
from alembic import op
import sqlalchemy as sa

revision = "0304_cc_local_source_mode"
down_revision = "0303_tree_role_configurable_build"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("cost_center_tree", sa.Column(
        "source_mode", sa.String(16), nullable=False, server_default="external_sync",
    ))
    op.create_check_constraint(
        "ck_cc_tree_source_mode", "cost_center_tree",
        "source_mode IN ('external_sync', 'local')",
    )


def downgrade():
    raise RuntimeError("成本中心来源归属不可自动降级")
