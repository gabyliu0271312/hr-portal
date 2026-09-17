"""Merge performance review and report audit migration heads."""

revision = "0217_merge_performance_and_report_heads"
down_revision = (
    "0215_performance_sub_question_parent_optional",
    "0216_report_merge_audit_details",
)
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
