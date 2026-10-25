"""Drop legacy column visibility flags; technical columns use code rules."""
from alembic import op
import sqlalchemy as sa

revision = "0270_drop_column_visibility"
down_revision = "0269_dataset_release_version"
branch_labels = None
depends_on = None


def upgrade():
    op.drop_column("table_columns", "is_visible")
    op.drop_column("dataset_output_fields", "is_visible")


def downgrade():
    op.add_column("table_columns", sa.Column("is_visible", sa.Boolean(), nullable=False, server_default="true"))
    op.add_column("dataset_output_fields", sa.Column("is_visible", sa.Boolean(), nullable=False, server_default="true"))
