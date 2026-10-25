"""Move standard-field display name out of semantic versions."""
from alembic import op
import sqlalchemy as sa

revision = "0272_standard_field_display_name"
down_revision = "0270_drop_column_visibility"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("standard_fields", sa.Column("display_name", sa.String(128), nullable=True))
    op.execute(
        "UPDATE standard_fields sf SET display_name = sv.field_name "
        "FROM standard_field_versions sv "
        "WHERE sv.standard_field_id = sf.id "
        "AND sv.version = (SELECT max(sv2.version) FROM standard_field_versions sv2 WHERE sv2.standard_field_id = sf.id)"
    )


def downgrade():
    op.drop_column("standard_fields", "display_name")
