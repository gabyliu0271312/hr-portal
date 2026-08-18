"""Allow table merge DWD relations to bind datasets directly."""
from alembic import op
import sqlalchemy as sa

revision = "0207_merge_dwd_relation_dataset"
down_revision = "0206_result_save_modes"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column("merge_dwd_relations", "report_id", nullable=True)
    op.add_column(
        "merge_dwd_relations",
        sa.Column("dataset_id", sa.BigInteger(), nullable=True),
    )
    op.create_foreign_key(
        "fk_merge_dwd_relation_dataset",
        "merge_dwd_relations",
        "datasets",
        ["dataset_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.create_index(
        "ix_merge_dwd_relation_dataset",
        "merge_dwd_relations",
        ["dataset_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_merge_dwd_relation_dataset", table_name="merge_dwd_relations")
    op.drop_constraint(
        "fk_merge_dwd_relation_dataset",
        "merge_dwd_relations",
        type_="foreignkey",
    )
    op.drop_column("merge_dwd_relations", "dataset_id")
    op.alter_column("merge_dwd_relations", "report_id", nullable=False)
