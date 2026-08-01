"""seed the cost-allocation webhook ingress instance without a secret

Revision ID: 0157_cost_allocation_webhook_instance
Revises: 0156_cost_allocation_webhook_catalog
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "0157_cost_allocation_webhook_instance"
down_revision = "0156_cost_allocation_webhook_catalog"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    bind.exec_driver_sql("""
        INSERT INTO ucp_system
          (system_code, system_name, system_type, owner, description, package_id, catalog_version, connection_mode, instance_config, is_active)
        SELECT 'COST_ALLOCATION_SYSTEM', '成本分摊系统', 'CUSTOM', 'system', '成本分摊周期锁定事件接入', p.id, p.version, 'STANDARD_SAAS', CAST('{}' AS json), 1
        FROM ucp_connector_package p
        WHERE p.package_code = 'COST_ALLOCATION_SYSTEM'
          AND NOT EXISTS (SELECT 1 FROM ucp_system WHERE system_code = 'COST_ALLOCATION_SYSTEM')
    """)
    bind.exec_driver_sql("""
        UPDATE ucp_system SET package_id = (SELECT id FROM ucp_connector_package WHERE package_code = 'COST_ALLOCATION_SYSTEM'),
          connection_mode = 'STANDARD_SAAS', catalog_version = '1.0.0'
        WHERE system_code = 'COST_ALLOCATION_SYSTEM' AND package_id IS NULL
    """)
    bind.exec_driver_sql("""
        INSERT INTO ucp_credentials
          (credential_code, credential_name, system_id, env_tag, is_primary, secrets_encrypted, auth_type, is_active, description, created_by)
        SELECT 'CRED-COST-ALLOCATION-PROD', '成本分摊生产签名凭证', s.id, 'prod', 0, CAST('{}' AS json), 'hmac_sha256_timestamped', 1,
          '密钥必须通过凭证管理页面录入；迁移不会写入或覆盖任何 secret。', 'system'
        FROM ucp_system s
        WHERE s.system_code = 'COST_ALLOCATION_SYSTEM'
          AND NOT EXISTS (SELECT 1 FROM ucp_credentials WHERE credential_code = 'CRED-COST-ALLOCATION-PROD')
    """)
    bind.exec_driver_sql("""
        INSERT INTO ucp_resource
          (system_id, resource_code, resource_name, connector_type, adapter_code, credential_id, protocol, status, created_by)
        SELECT s.id, 'cost-allocation-locked', '周期锁定事件接收', 'webhook_ingress', NULL, c.id,
          CAST('{"ingress":{"verification_strategy":"HMAC_SHA256_TIMESTAMPED","integration_id":"cost-allocation-locked","integration_header":"X-Integration-Id","request_id_header":"X-Request-Id","timestamp_header":"X-Timestamp","nonce_header":"X-Nonce","signature_header":"X-Signature","timestamp_tolerance_seconds":300,"rate_limit_per_minute":120,"rate_limit_burst":10,"max_body_bytes":1048576,"event_type_path":"event_type","event_id_path":"request_id","batch_id_path":"batch_id","period_path":"period","records_path":"records","target_asset":"emp_monthly_allocation"}}' AS json),
          1, 'system'
        FROM ucp_system s JOIN ucp_credentials c ON c.system_id = s.id AND c.credential_code = 'CRED-COST-ALLOCATION-PROD'
        WHERE s.system_code = 'COST_ALLOCATION_SYSTEM'
          AND NOT EXISTS (SELECT 1 FROM ucp_resource r WHERE r.system_id = s.id AND r.resource_code = 'cost-allocation-locked')
    """)
    bind.exec_driver_sql("""
        UPDATE ucp_resource SET connector_type = 'webhook_ingress', adapter_code = NULL,
          credential_id = COALESCE(credential_id, (SELECT c.id FROM ucp_credentials c WHERE c.credential_code = 'CRED-COST-ALLOCATION-PROD'))
        WHERE resource_code = 'cost-allocation-locked'
    """)
    bind.exec_driver_sql("""
        INSERT INTO ucp_event_definition
          (package_id, event_code, event_name, source_system_type, payload_schema, normalization_schema, verification_strategy, version, status, risk_level)
        SELECT p.id, 'allocation_period.locked', '成本分摊周期锁定', 'COST_ALLOCATION_SYSTEM', CAST('{}' AS json), CAST('{}' AS json), 'HMAC_SHA256_TIMESTAMPED', '1.0.0', 'PUBLISHED', 'write_medium'
        FROM ucp_connector_package p
        WHERE p.package_code = 'COST_ALLOCATION_SYSTEM'
          AND NOT EXISTS (SELECT 1 FROM ucp_event_definition WHERE event_code = 'allocation_period.locked' AND version = '1.0.0')
    """)
    bind.exec_driver_sql("""
        INSERT INTO ucp_resource_data_object
          (resource_id, connector_type, object_code, object_name, object_type, event_definition_id, event_config, verification_status, schema_version, is_active, created_by)
        SELECT r.id, 'webhook_ingress', 'ALLOCATION_PERIOD_LOCKED', '周期锁定事件', 'EVENT_TYPE', e.id,
          CAST('{"event_type_path":"event_type","event_id_path":"request_id","batch_id_path":"batch_id","records_path":"records"}' AS json), 'VERIFIED', '1.0.0', 1, 'system'
        FROM ucp_resource r JOIN ucp_event_definition e ON e.event_code = 'allocation_period.locked' AND e.version = '1.0.0'
        WHERE r.resource_code = 'cost-allocation-locked'
          AND NOT EXISTS (SELECT 1 FROM ucp_resource_data_object o WHERE o.resource_id = r.id AND o.object_code = 'ALLOCATION_PERIOD_LOCKED')
    """)
    bind.exec_driver_sql("""
        INSERT INTO ucp_pipeline_config
          (pipeline_code, pipeline_name, description, steps, trigger_type, trigger_config, error_handling, status, created_by)
        SELECT 'COST_ALLOCATION_LOCKED_INGEST', '成本分摊锁定入仓', '按期间全量快照写入员工月度成本分摊资产',
          CAST('[{"id":"write_asset","type":"WAREHOUSE_ASSET_SINK","label":"写入成本分摊资产","config":{"target_asset":"emp_monthly_allocation","write_mode":"period_full_snapshot","period_field":"cost_period","field_whitelist":["cost_period","employee_no","employee","code","dimension_value","headcount"],"mapping":[{"source":"period","target":"cost_period","transform":"yyyy_mm_to_yyyymm","required":true},{"source":"employee_no","target":"employee_no","transform":"string","required":true},{"source":"employee_name","target":"employee","transform":"identity","required":true},{"source":"project_code","target":"code","transform":"identity","required":true},{"source":"project_name","target":"dimension_value","transform":"identity","required":true},{"source":"allocation_percentage","target":"headcount","transform":"decimal_divide_100","required":true}],"validations":[{"type":"group_sum_equals","group_by":["cost_period","employee_no"],"sum_field":"headcount","expected":1,"tolerance":0.0001}]}}]' AS json),
          'EVENT', CAST('{}' AS json), 'STOP_ON_ERROR', 1, 'system'
        WHERE EXISTS (SELECT 1 FROM registered_tables WHERE table_name = 'emp_monthly_allocation' AND asset_status = 'published' AND is_period = true)
          AND NOT EXISTS (SELECT 1 FROM ucp_pipeline_config WHERE pipeline_code = 'COST_ALLOCATION_LOCKED_INGEST')
    """)
    bind.exec_driver_sql("""
        INSERT INTO ucp_event_trigger
          (trigger_code, trigger_name, description, event_source, source_resource_id, event_types, pipeline_code, trigger_type, source_resource_object_id, filter_rule, is_active, failure_policy, created_by)
        SELECT 'COST_ALLOCATION_LOCKED_TRIGGER', '周期锁定事件触发器', '成本分摊锁定事件进入入仓流水线', 'WEBHOOK', r.id, 'allocation_period.locked', 'COST_ALLOCATION_LOCKED_INGEST', 'WEBHOOK', o.id, CAST('{}' AS json), 1, 'RETRY', 'system'
        FROM ucp_resource r JOIN ucp_resource_data_object o ON o.resource_id = r.id AND o.object_code = 'ALLOCATION_PERIOD_LOCKED'
        WHERE r.resource_code = 'cost-allocation-locked'
          AND EXISTS (SELECT 1 FROM ucp_pipeline_config WHERE pipeline_code = 'COST_ALLOCATION_LOCKED_INGEST')
          AND NOT EXISTS (SELECT 1 FROM ucp_event_trigger WHERE trigger_code = 'COST_ALLOCATION_LOCKED_TRIGGER')
    """)


def downgrade() -> None:
    bind = op.get_bind()
    bind.exec_driver_sql("DELETE FROM ucp_event_trigger WHERE trigger_code = 'COST_ALLOCATION_LOCKED_TRIGGER'")
    bind.exec_driver_sql("DELETE FROM ucp_pipeline_config WHERE pipeline_code = 'COST_ALLOCATION_LOCKED_INGEST'")
    bind.exec_driver_sql("DELETE FROM ucp_resource_data_object WHERE object_code = 'ALLOCATION_PERIOD_LOCKED'")
    bind.exec_driver_sql("DELETE FROM ucp_event_definition WHERE event_code = 'allocation_period.locked' AND version = '1.0.0'")
    bind.exec_driver_sql("DELETE FROM ucp_resource WHERE resource_code = 'cost-allocation-locked'")
    bind.exec_driver_sql("DELETE FROM ucp_credentials WHERE credential_code = 'CRED-COST-ALLOCATION-PROD' AND secrets_encrypted::text = '{}'")
    bind.exec_driver_sql("DELETE FROM ucp_system WHERE system_code = 'COST_ALLOCATION_SYSTEM'")
