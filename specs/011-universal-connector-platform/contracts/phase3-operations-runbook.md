# Phase 3 High-risk Connector Runbook

## Controlled write

1. Verify the request preview contains no credentials or secrets.
2. Confirm the approval record, approvers, idempotency key, and confirmation token.
3. Execute from the approval inbox only after the request is approved.
4. Inspect the approval execution result and external request reference. On failure,
   do not resubmit with a new idempotency key until the external side effect is known.
5. Use the connector-specific compensation action where the provider supports it.

## Webhook incident

1. Check signature validation and timestamp/replay diagnostics first.
2. Do not disable signature validation to restore traffic.
3. Reprocess only the verified event payload through the event reliability flow.
4. Record the trace ID, provider event ID, and remediation in the operational log.

## Adapter migration

1. Open Change Management and run a migration preview.
2. Review every impacted pipeline; preview never mutates a resource.
3. Confirm each selected resource to create a high-risk change record.
4. Publish only through the migration API after the required review and explicit confirmation are complete.
5. If validation fails, use the change rollback action. It restores the captured
   pre-migration resource snapshot and leaves existing pipelines intact.
