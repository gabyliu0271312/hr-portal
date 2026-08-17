"""Add generic result save modes to merge templates."""
from alembic import op
import sqlalchemy as sa

revision = "0206_result_save_modes"
down_revision = "0205_merge_result_snapshots"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "merge_templates",
        sa.Column("result_save_mode", sa.String(length=16), nullable=False, server_default="input_period"),
    )
    op.add_column(
        "merge_templates",
        sa.Column("result_period_field", sa.String(length=128), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("merge_templates", "result_period_field")
    op.drop_column("merge_templates", "result_save_mode")
