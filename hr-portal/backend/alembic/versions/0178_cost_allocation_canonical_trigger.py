"""Restore the canonical cost-allocation trigger and disable its duplicate."""
from alembic import op

revision = "0178_cost_allocation_canonical_trigger"
down_revision = "0177_cost_allocation_trigger_cleanup"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        UPDATE ucp_event_trigger
        SET is_active = 0, migration_status = 'DISABLED'
        WHERE trigger_code = 'COST_ALLOCATION_LOCKED_INGEST'
    """)
    op.execute("""
        INSERT INTO ucp_event_trigger
          (trigger_code, trigger_name, description, event_source,
           source_resource_id, event_types, pipeline_code, trigger_type,
           run_as_type, source_resource_object_id, filter_rule, is_active,
           failure_policy, created_by, migration_status, schedule_config,
           input_schema)
        SELECT
          'COST_ALLOCATION_LOCKED_TRIGGER',
          '成本分摊锁定入仓',
          '成本分摊锁定事件进入入仓流水线',
          'WEBHOOK',
          r.id,
          'allocation_period.locked',
          'COST_ALLOCATION_LOCKED_INGEST',
          'WEBHOOK',
          'SERVICE_ACCOUNT',
          o.id,
          CAST('{}' AS json),
          1,
          'RETRY',
          'system',
          'ACTIVE',
          CAST('{}' AS json),
          CAST('{}' AS json)
        FROM ucp_resource r
        JOIN ucp_resource_data_object o
          ON o.resource_id = r.id
         AND o.object_code = 'ALLOCATION_PERIOD_LOCKED'
        WHERE r.resource_code = 'cost-allocation-locked'
          AND EXISTS (
              SELECT 1 FROM ucp_pipeline_config
              WHERE pipeline_code = 'COST_ALLOCATION_LOCKED_INGEST'
          )
          AND NOT EXISTS (
              SELECT 1 FROM ucp_event_trigger
              WHERE trigger_code = 'COST_ALLOCATION_LOCKED_TRIGGER'
          )
    """)
    op.execute("""
        UPDATE ucp_event_trigger
        SET is_active = 1, migration_status = 'ACTIVE'
        WHERE trigger_code = 'COST_ALLOCATION_LOCKED_TRIGGER'
    """)


def downgrade() -> None:
    op.execute("""
        UPDATE ucp_event_trigger
        SET is_active = 1, migration_status = 'ACTIVE'
        WHERE trigger_code = 'COST_ALLOCATION_LOCKED_INGEST'
    """)
    op.execute("""
        DELETE FROM ucp_event_trigger
        WHERE trigger_code = 'COST_ALLOCATION_LOCKED_TRIGGER'
    """)
