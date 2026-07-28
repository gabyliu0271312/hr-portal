'''connector package release metadata'''

import sqlalchemy as sa
from alembic import op


revision = '0132'
down_revision = '0131'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('ucp_connector_package', sa.Column('release_notes', sa.Text(), nullable=True))
    op.add_column('ucp_connector_package', sa.Column('compatibility_impact', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('ucp_connector_package', 'compatibility_impact')
    op.drop_column('ucp_connector_package', 'release_notes')
