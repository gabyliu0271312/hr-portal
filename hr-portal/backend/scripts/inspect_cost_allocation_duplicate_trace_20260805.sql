-- Read-only diagnosis for the duplicated cost-allocation trace.
-- Run inside the production db container before the cleanup script.
\set ON_ERROR_STOP on

WITH target_event AS (
    SELECT *
    FROM ucp_event
    WHERE trace_id = 'trace_20260805_035443_dd6572b7'
), target_runs AS (
    SELECT *
    FROM ucp_pipeline_execution
    WHERE trace_id = 'trace_20260805_035443_dd6572b7'
)
SELECT
    'event' AS record_type,
    event.id::text AS record_id,
    event.event_id,
    event.event_type,
    event.matched_trigger_code,
    event.pipeline_run_id,
    event.status,
    event.trace_id
FROM target_event event
UNION ALL
SELECT
    'delivery',
    delivery.id::text,
    delivery.event_uuid,
    delivery.trigger_code,
    NULL,
    delivery.pipeline_run_id,
    delivery.status,
    event.trace_id
FROM ucp_event_delivery delivery
JOIN target_event event ON event.id = delivery.event_id
UNION ALL
SELECT
    'pipeline_execution',
    execution.id::text,
    execution.pipeline_code,
    execution.trigger_type,
    NULL,
    execution.pipeline_run_id,
    execution.status,
    execution.trace_id
FROM target_runs execution
ORDER BY record_type, record_id;

SELECT
    execution.pipeline_run_id,
    COUNT(step.id) AS step_count,
    COUNT(DISTINCT loop_item.id) AS loop_item_count,
    COUNT(DISTINCT log.id) AS execution_log_count,
    COUNT(DISTINCT delivery.id) AS delivery_count
FROM ucp_pipeline_execution execution
LEFT JOIN ucp_pipeline_step_execution step
  ON step.pipeline_run_id = execution.pipeline_run_id
LEFT JOIN ucp_loop_item_execution loop_item
  ON loop_item.pipeline_run_id = execution.pipeline_run_id
LEFT JOIN ucp_execution_log log
  ON log.pipeline_run_id = execution.pipeline_run_id
LEFT JOIN ucp_event_delivery delivery
  ON delivery.pipeline_run_id = execution.pipeline_run_id
WHERE execution.trace_id = 'trace_20260805_035443_dd6572b7'
GROUP BY execution.pipeline_run_id
ORDER BY execution.pipeline_run_id;
