"""Add bilingual name/description columns to performance_roles."""
from alembic import op
import sqlalchemy as sa

revision = "0331_performance_role_bilingual"
down_revision = "0330_performance_auth_rules"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("performance_roles", sa.Column("name_en", sa.String(64), nullable=True))
    op.add_column("performance_roles", sa.Column("description_en", sa.Text(), nullable=True))


def downgrade():
    op.drop_column("performance_roles", "description_en")
    op.drop_column("performance_roles", "name_en")
