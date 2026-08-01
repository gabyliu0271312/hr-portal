"""register the cost allocation webhook system and resource template"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "0156_cost_allocation_webhook_catalog"
down_revision = "0161_push_target_schema_history"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    bind.exec_driver_sql("""
        INSERT INTO ucp_connector_package
          (package_code, package_name, category, connection_mode, version, status,
           host_allowlist, auth_policy, system_schema, feature_flags, owner, description)
        SELECT
          'COST_ALLOCATION_SYSTEM', '成本分摊系统', 'STANDARD_SAAS', 'STANDARD_SAAS', '1.0.0', 'PUBLISHED',
          CAST('[]' AS json),
          CAST('{"auth_type":"hmac_sha256_timestamped","credential_schema":[{"key":"signing_secret","label":"签名密钥","required":true,"type":"password"}]}' AS json),
          CAST('{"base_url":"","fields":[]}' AS json),
          CAST('{}' AS json), 'system', '接收成本分摊系统周期锁定事件'
        WHERE NOT EXISTS (SELECT 1 FROM ucp_connector_package WHERE package_code = 'COST_ALLOCATION_SYSTEM')
    """)
    bind.exec_driver_sql("""
        INSERT INTO ucp_connector_package
          (package_code, package_name, category, connection_mode, version, status,
           host_allowlist, auth_policy, system_schema, feature_flags, owner, description)
        SELECT
          'COST_ALLOCATION_LOCKED_INGRESS', '周期锁定事件接收', 'INSTANCE_RESOURCE', 'INSTANCE_RESOURCE', '1.0.0', 'PUBLISHED',
          CAST('[]' AS json), CAST('{}' AS json),
          CAST('{"parent_package_code":"COST_ALLOCATION_SYSTEM","resource_connector_type":"webhook_ingress"}' AS json),
          CAST('{}' AS json), 'system', 'Webhook 入站资源，接收 allocation_period.locked'
        WHERE NOT EXISTS (SELECT 1 FROM ucp_connector_package WHERE package_code = 'COST_ALLOCATION_LOCKED_INGRESS')
    """)
    bind.exec_driver_sql("""
        UPDATE ucp_system
        SET package_id = (SELECT id FROM ucp_connector_package WHERE package_code = 'COST_ALLOCATION_SYSTEM'),
            connection_mode = 'STANDARD_SAAS'
        WHERE UPPER(system_code) IN ('COST_ALLOCATION_SYSTEM', 'COST_ALLOCATION')
          AND package_id IS NULL
    """)
    bind.exec_driver_sql("""
        UPDATE ucp_resource
        SET connector_type = 'webhook_ingress', adapter_code = NULL
        WHERE resource_code = 'cost-allocation-locked'
    """)


def downgrade() -> None:
    bind = op.get_bind()
    bind.exec_driver_sql("""
        UPDATE ucp_resource
        SET connector_type = NULL
        WHERE resource_code = 'cost-allocation-locked' AND connector_type = 'webhook_ingress'
    """)
    bind.exec_driver_sql("""
        UPDATE ucp_system
        SET package_id = NULL, connection_mode = NULL
        WHERE package_id = (SELECT id FROM ucp_connector_package WHERE package_code = 'COST_ALLOCATION_SYSTEM')
    """)
    bind.exec_driver_sql("""
        DELETE FROM ucp_connector_package
        WHERE package_code IN ('COST_ALLOCATION_LOCKED_INGRESS', 'COST_ALLOCATION_SYSTEM')
    """)
