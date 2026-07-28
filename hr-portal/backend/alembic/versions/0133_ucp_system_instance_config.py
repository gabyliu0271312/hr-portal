'''persist connector package system-schema values on each system instance'''

import sqlalchemy as sa
from alembic import op


revision = '0133'
down_revision = '0132'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'ucp_system',
        sa.Column('instance_config', sa.JSON(), nullable=False, server_default=sa.text("'{}'")),
    )
    op.alter_column('ucp_system', 'instance_config', server_default=None)


def downgrade() -> None:
    op.drop_column('ucp_system', 'instance_config')
