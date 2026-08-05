-- One-time cleanup for the duplicated historical cost-allocation webhook trace.
-- This script is intentionally narrow: it will abort unless the target trace has
-- exactly four pipeline executions and a canonical delivery on the retained trigger.
\set ON_ERROR_STOP on

BEGIN;

CREATE TEMP TABLE cleanup_target_runs ON COMMIT DROP AS
WITH canonical_delivery AS (
    SELECT
        delivery.pipeline_run_id AS keep_run_id,
        delivery.id AS keep_delivery_id,
        delivery.trigger_id AS keep_trigger_id
    FROM ucp_event event
    JOIN ucp_event_delivery delivery
      ON delivery.event_id = event.id
     AND delivery.pipeline_run_id IS NOT NULL
    WHERE event.trace_id = 'trace_20260805_035443_dd6572b7'
      AND delivery.trigger_code = 'COST_ALLOCATION_LOCKED_TRIGGER'
    ORDER BY
        CASE WHEN delivery.pipeline_run_id = event.pipeline_run_id THEN 0 ELSE 1 END,
        delivery.id DESC
    LIMIT 1
)
SELECT
    execution.pipeline_run_id,
    canonical_delivery.keep_run_id,
    canonical_delivery.keep_delivery_id,
    canonical_delivery.keep_trigger_id
FROM ucp_pipeline_execution execution
CROSS JOIN canonical_delivery
WHERE execution.trace_id = 'trace_20260805_035443_dd6572b7';

DO $$
DECLARE
    execution_count integer;
    retained_count integer;
    keep_run_id text;
    keep_delivery_id bigint;
BEGIN
    SELECT
        COUNT(*),
        COUNT(*) FILTER (WHERE target.pipeline_run_id = target.keep_run_id),
        MIN(target.keep_run_id),
        MIN(target.keep_delivery_id)
    INTO execution_count, retained_count, keep_run_id, keep_delivery_id
    FROM cleanup_target_runs target;

    IF execution_count <> 4 THEN
        RAISE EXCEPTION
            'Expected exactly 4 executions for trace_20260805_035443_dd6572b7, found %',
            execution_count;
    END IF;
    IF keep_run_id IS NULL OR keep_delivery_id IS NULL OR retained_count <> 1 THEN
        RAISE EXCEPTION
            'Canonical COST_ALLOCATION_LOCKED_TRIGGER delivery/run is missing or invalid';
    END IF;
END $$;

-- Keep the event and warehouse batch audit, but repoint both to the retained run.
UPDATE ucp_event event
SET
    pipeline_run_id = target.keep_run_id,
    matched_trigger_id = target.keep_trigger_id,
    matched_trigger_code = 'COST_ALLOCATION_LOCKED_TRIGGER'
FROM (
    SELECT DISTINCT keep_run_id, keep_trigger_id
    FROM cleanup_target_runs
) target
WHERE event.trace_id = 'trace_20260805_035443_dd6572b7';

UPDATE ucp_warehouse_ingest_batch batch
SET
    pipeline_run_id = target.keep_run_id,
    trace_id = 'trace_20260805_035443_dd6572b7'
FROM (
    SELECT DISTINCT keep_run_id
    FROM cleanup_target_runs
) target
WHERE batch.pipeline_run_id IN (
    SELECT pipeline_run_id
    FROM cleanup_target_runs
    WHERE pipeline_run_id <> keep_run_id
);

-- Remove only execution artifacts for the three non-canonical historical runs.
DELETE FROM ucp_loop_item_execution item
USING cleanup_target_runs target
WHERE item.pipeline_run_id = target.pipeline_run_id
  AND target.pipeline_run_id <> target.keep_run_id;

DELETE FROM ucp_pipeline_step_execution step
USING cleanup_target_runs target
WHERE step.pipeline_run_id = target.pipeline_run_id
  AND target.pipeline_run_id <> target.keep_run_id;

DELETE FROM ucp_resource_snapshot snapshot
USING cleanup_target_runs target
WHERE snapshot.pipeline_run_id = target.pipeline_run_id
  AND target.pipeline_run_id <> target.keep_run_id;

DELETE FROM ucp_execution_log log
USING cleanup_target_runs target
WHERE log.pipeline_run_id = target.pipeline_run_id
  AND target.pipeline_run_id <> target.keep_run_id;

DELETE FROM ucp_notification_log notification
USING cleanup_target_runs target
WHERE notification.pipeline_run_id = target.pipeline_run_id
  AND target.pipeline_run_id <> target.keep_run_id;

DELETE FROM ucp_alert_log alert
USING cleanup_target_runs target
WHERE alert.pipeline_run_id = target.pipeline_run_id
  AND target.pipeline_run_id <> target.keep_run_id;

DELETE FROM ucp_event_delivery delivery
USING cleanup_target_runs target
WHERE delivery.pipeline_run_id = target.pipeline_run_id
  AND target.pipeline_run_id <> target.keep_run_id;

DELETE FROM ucp_pipeline_execution execution
USING cleanup_target_runs target
WHERE execution.pipeline_run_id = target.pipeline_run_id
  AND target.pipeline_run_id <> target.keep_run_id;

SELECT
    'retained_run' AS check_name,
    keep_run_id AS value
FROM cleanup_target_runs
WHERE pipeline_run_id = keep_run_id
UNION ALL
SELECT
    'remaining_execution_count',
    COUNT(*)::text
FROM ucp_pipeline_execution
WHERE trace_id = 'trace_20260805_035443_dd6572b7';

COMMIT;
