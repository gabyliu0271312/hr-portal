"""merge 0073 and 0091 heads

Revision ID: 0092
Revises: 0073, 0091
Create Date: 2026-07-13
"""
from alembic import op
import sqlalchemy as sa

revision = '0092'
down_revision = ('0073', '0091')

def upgrade():
    pass

def downgrade():
    pass
