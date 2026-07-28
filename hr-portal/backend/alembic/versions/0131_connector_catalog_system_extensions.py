'''connector catalog and system extension capabilities'''

import sqlalchemy as sa
from alembic import op


revision = '0131'
down_revision = '0130'
branch_labels = None
depends_on = None


def _json_default(value: str):
    return sa.text(chr(39) + value + chr(39) + '::json')


def upgrade() -> None:
    package_columns = [
        sa.Column('category', sa.String(length=32), nullable=False, server_default='STANDARD_SAAS'),
        sa.Column('icon', sa.String(length=64), nullable=True),
        sa.Column('auth_policy', sa.JSON(), nullable=False, server_default=_json_default('{}')),
        sa.Column('system_schema', sa.JSON(), nullable=False, server_default=_json_default('{}')),
        sa.Column('feature_flags', sa.JSON(), nullable=False, server_default=_json_default('{}')),
        sa.Column('owner', sa.String(length=64), nullable=True),
        sa.Column('published_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('deprecated_at', sa.DateTime(timezone=True), nullable=True),
    ]
    for column in package_columns:
        op.add_column('ucp_connector_package', column)
    op.execute(sa.text('UPDATE ucp_connector_package SET category = connection_mode'))
    op.create_index('ix_ucp_connector_package_category_status', 'ucp_connector_package', ['category', 'status'])

    for column in [
        sa.Column('package_id', sa.BigInteger(), nullable=True),
        sa.Column('catalog_version', sa.String(length=32), nullable=True),
        sa.Column('connection_mode', sa.String(length=32), nullable=True),
    ]:
        op.add_column('ucp_system', column)
    op.create_foreign_key('fk_ucp_system_package_id', 'ucp_system', 'ucp_connector_package', ['package_id'], ['id'], ondelete='RESTRICT')

    for column in [
        sa.Column('system_id', sa.BigInteger(), nullable=True),
        sa.Column('scope', sa.String(length=16), nullable=False, server_default='PACKAGE'),
        sa.Column('source_type', sa.String(length=32), nullable=False, server_default='PRESET'),
        sa.Column('approval_status', sa.String(length=32), nullable=False, server_default='PUBLISHED'),
        sa.Column('executor_template_id', sa.BigInteger(), nullable=True),
    ]:
        op.add_column('ucp_operation_definition', column)
    op.create_foreign_key('fk_ucp_operation_definition_system_id', 'ucp_operation_definition', 'ucp_system', ['system_id'], ['id'], ondelete='RESTRICT')
    op.create_foreign_key('fk_ucp_operation_definition_template_id', 'ucp_operation_definition', 'ucp_api_template', ['executor_template_id'], ['id'], ondelete='SET NULL')
    op.create_index('ix_ucp_operation_definition_system_status', 'ucp_operation_definition', ['system_id', 'status'])

    for column in [
        sa.Column('package_id', sa.BigInteger(), nullable=True),
        sa.Column('owning_system_id', sa.BigInteger(), nullable=True),
        sa.Column('operation_definition_id', sa.BigInteger(), nullable=True),
        sa.Column('allowed_domains_snapshot', sa.JSON(), nullable=False, server_default=_json_default('[]')),
        sa.Column('auth_policy_snapshot', sa.JSON(), nullable=False, server_default=_json_default('{}')),
    ]:
        op.add_column('ucp_api_template', column)
    op.create_foreign_key('fk_ucp_api_template_package_id', 'ucp_api_template', 'ucp_connector_package', ['package_id'], ['id'], ondelete='SET NULL')
    op.create_foreign_key('fk_ucp_api_template_system_id', 'ucp_api_template', 'ucp_system', ['owning_system_id'], ['id'], ondelete='SET NULL')
    op.create_foreign_key('fk_ucp_api_template_operation_id', 'ucp_api_template', 'ucp_operation_definition', ['operation_definition_id'], ['id'], ondelete='SET NULL')
    op.create_index('ix_ucp_api_template_owning_system', 'ucp_api_template', ['owning_system_id'])


def downgrade() -> None:
    bind = op.get_bind()
    active = bind.execute(sa.text('SELECT COUNT(*) FROM ucp_operation_definition WHERE scope = ''SYSTEM'' AND status = ''PUBLISHED''')).scalar_one()
    if active:
        raise RuntimeError('Published system extension operations must be retired before downgrade')
    op.drop_index('ix_ucp_api_template_owning_system', table_name='ucp_api_template')
    for name in ['fk_ucp_api_template_operation_id', 'fk_ucp_api_template_system_id', 'fk_ucp_api_template_package_id']:
        op.drop_constraint(name, 'ucp_api_template', type_='foreignkey')
    for name in ['auth_policy_snapshot', 'allowed_domains_snapshot', 'operation_definition_id', 'owning_system_id', 'package_id']:
        op.drop_column('ucp_api_template', name)
    op.drop_index('ix_ucp_operation_definition_system_status', table_name='ucp_operation_definition')
    for name in ['fk_ucp_operation_definition_template_id', 'fk_ucp_operation_definition_system_id']:
        op.drop_constraint(name, 'ucp_operation_definition', type_='foreignkey')
    for name in ['executor_template_id', 'approval_status', 'source_type', 'scope', 'system_id']:
        op.drop_column('ucp_operation_definition', name)
    op.drop_constraint('fk_ucp_system_package_id', 'ucp_system', type_='foreignkey')
    for name in ['connection_mode', 'catalog_version', 'package_id']:
        op.drop_column('ucp_system', name)
    op.drop_index('ix_ucp_connector_package_category_status', table_name='ucp_connector_package')
    for name in ['deprecated_at', 'published_at', 'owner', 'feature_flags', 'system_schema', 'auth_policy', 'icon', 'category']:
        op.drop_column('ucp_connector_package', name)
