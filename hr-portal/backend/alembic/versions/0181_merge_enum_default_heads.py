"""Merge the period automation and enum default migration heads."""

from alembic import op


revision = "0181_merge_enum_default_heads"
down_revision = ("0180_align_period_snapshot_automation", "0180_enum_default")
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
