"""Merge the performance schema and DWD identity migration heads."""

revision = "0226_merge_performance_and_dwd_heads"
down_revision = (
    "0224_performance_self_summary_answers",
    "0225_repair_dwd_id_identity",
)
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
