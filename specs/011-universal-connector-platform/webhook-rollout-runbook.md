# Webhook resource rollout and rollback

## Preflight

1. Verify every event object is `VERIFIED` and its event definition is `PUBLISHED`.
2. Review `GET /api/v1/ucp/trigger-migration/status`; migrate legacy trigger paths before enabling production traffic.
3. Enable `UCP_WEBHOOK_RESOURCE_INGRESS_ENABLED=true` only after the vendor callback points to the resource path.

## Rollout

1. Create the webhook ingress resource and event objects.
2. Verify the resource and each object with a redacted sample event.
3. Create the disabled resource-bound trigger, test it with `dry_run=true`, then enable it.
4. Disable the matching legacy trigger before switching the vendor callback to avoid duplicate account operations.

## Rollback

1. Set `UCP_WEBHOOK_RESOURCE_INGRESS_ENABLED=false`.
2. Repoint the vendor callback to the existing legacy path and enable only the corresponding legacy trigger.
3. Check event IDs, trigger deliveries, account-operation idempotency keys, and dead letters before re-enabling any new trigger.
