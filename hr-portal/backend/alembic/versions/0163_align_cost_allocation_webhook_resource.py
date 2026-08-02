"""Align cost-allocation webhook resource and event-object semantics."""
from __future__ import annotations

from alembic import op

revision = "0163_align_cost_allocation_webhook_resource"
down_revision = "0162_repair_cost_allocation_ingest_pipeline"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    bind.exec_driver_sql("""
        UPDATE ucp_connector_package
        SET package_name = '成本分摊系统 Webhook',
            description = 'Webhook 入站资源，承载成本分摊系统的多个事件对象',
            system_schema = CAST('{"parent_package_code":"COST_ALLOCATION_SYSTEM","resource_connector_type":"webhook_ingress","resource_code":"cost-allocation-locked","resource_name":"成本分摊系统 Webhook"}' AS json)
        WHERE package_code = 'COST_ALLOCATION_LOCKED_INGRESS'
    """)
    bind.exec_driver_sql("""
        UPDATE ucp_resource
        SET resource_name = '成本分摊系统 Webhook', connector_type = 'webhook_ingress'
        WHERE resource_code = 'cost-allocation-locked'
    """)
    bind.exec_driver_sql("""
        UPDATE ucp_event_definition
        SET event_name = '周期锁定'
        WHERE event_code = 'allocation_period.locked' AND version = '1.0.0'
    """)
    bind.exec_driver_sql("""
        UPDATE ucp_resource_data_object
        SET object_name = '周期锁定'
        WHERE object_code = 'ALLOCATION_PERIOD_LOCKED' AND object_type = 'EVENT_TYPE'
    """)


def downgrade() -> None:
    bind = op.get_bind()
    bind.exec_driver_sql("""
        UPDATE ucp_connector_package
        SET package_name = '周期锁定事件接收',
            description = 'Webhook 入站资源，接收 allocation_period.locked',
            system_schema = CAST('{"parent_package_code":"COST_ALLOCATION_SYSTEM","resource_connector_type":"webhook_ingress"}' AS json)
        WHERE package_code = 'COST_ALLOCATION_LOCKED_INGRESS'
    """)
    bind.exec_driver_sql("""
        UPDATE ucp_resource
        SET resource_name = '周期锁定事件接收'
        WHERE resource_code = 'cost-allocation-locked'
    """)
    bind.exec_driver_sql("""
        UPDATE ucp_event_definition
        SET event_name = '成本分摊周期锁定'
        WHERE event_code = 'allocation_period.locked' AND version = '1.0.0'
    """)
    bind.exec_driver_sql("""
        UPDATE ucp_resource_data_object
        SET object_name = '周期锁定事件'
        WHERE object_code = 'ALLOCATION_PERIOD_LOCKED' AND object_type = 'EVENT_TYPE'
    """)