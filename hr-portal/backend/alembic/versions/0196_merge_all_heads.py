"""Merge all heads before 017 mapping metadata migration."""

revision = "0196_merge_all_heads"
# 0100/0101 and the lineage branch are already ancestors of the two
# production branches below. Repeating them here makes Alembic try to remove
# an already-removed head during upgrade from an existing database.
down_revision = (
    "0191_performance_project_shell",
    "0195_quality_rule_dependency_index",
)
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
