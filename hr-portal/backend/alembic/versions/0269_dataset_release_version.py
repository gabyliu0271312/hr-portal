"""Separate dataset release counter from the structural version."""
from alembic import op
import sqlalchemy as sa

revision = "0269_dataset_release_version"
down_revision = "0268_warehouse_conversion_evidence"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "datasets",
        sa.Column("release_version", sa.Integer(), nullable=False, server_default="0"),
    )
    op.create_check_constraint("ck_datasets_release_version", "datasets", "release_version >= 0")


def downgrade():
    op.drop_constraint("ck_datasets_release_version", "datasets", type_="check")
    op.drop_column("datasets", "release_version")
