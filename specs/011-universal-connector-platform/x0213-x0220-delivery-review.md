# X0213-X0220 delivery review

## Acceptance result

- Accepted on the agreed local-development standard: implementation complete, automated regression passed, code review passed, migration reversible, and Docker runtime verified.
- Production supplier callback drills are explicitly out of scope for this acceptance decision.

## Follow-up design revision

- X0221 replaces the canvas-external trigger-summary presentation with a first-class `START_TRIGGER` group node. The node is the visible workflow entry point and renders the configured Webhook, Schedule, Manual, Platform Event, or data-change triggers with OR semantics.
- Resource credentials, callback paths, and signature settings remain owned by resource configuration; the canvas only references safe trigger and resource-object identities.

## X0221 acceptance

- Accepted on July 25, 2026: templates now enforce exactly one `START_TRIGGER`; the node has no inbound edge and its config rejects callback URLs, secrets, signatures, and credential references.
- The designer renders trigger rows inside the start group, hides the group from the draggable palette, prevents deletion and inbound connections, and links operators to `/ucp/events/triggers` for safe maintenance.
- Migration `0128` backfilled current templates and historical template versions. Docker verification confirmed `TPL_OFFBOARDING_ACCOUNT`: `START_TRIGGER -> TIME_STRATEGY -> APPROVAL -> CONNECTOR -> NOTIFY`.
- Regression evidence: `253 passed`; frontend `vue-tsc` and production build passed; migration `0127 -> 0128 -> 0127 -> 0128` passed; `git diff --check` passed.

## X0222 follow-up contract

- The node-library audit found that palette metadata, template validation, seed data, and engine dispatch were not fully aligned, and that execution previously followed node-array order rather than visual edges.
- X0222 is the required corrective implementation: a backend-owned node catalog, uniform four-character labels and `Nxx` codes, mode-selectable start triggers, connector operation configuration, graph validation, and topology-driven execution.

## X0222 acceptance

- Accepted on July 25, 2026: the backend node catalog is now the source for template validation and palette metadata. It defines `N01` through `N13`, including four-character Chinese display labels, category, color, icon, and configuration contract.
- `START_TRIGGER` supports selection of Webhook, Schedule, Manual, and Platform Event modes. Data-change remains explicitly planned and is removed from persisted start-node configuration until an event-source delivery path exists.
- Templates now reject cycles and unreachable nodes, and the runtime validates then topologically orders steps from `edges_json`. Connector and Loop nodes support modern `resource_id` execution paths.
- Regression evidence: `256 passed`; frontend production build passed; migration `0128 -> 0129 -> 0128 -> 0129` passed; current templates contain no `DATA_CHANGE` mode; `git diff --check` passed.

## Review adjustments

- Added resource-object identity to event-to-trigger matching and verified published event-object activation checks.
- Removed legacy trigger write paths that could persist callback secrets or paths; retained read and callback compatibility during migration.
- Added migration status, operator rollback, deduplication, ingress rejection audit, and monitor alerts.
- Added controlled event payload access with export permission, reason capture, and immutable audit metadata.
- Seeded manual and scheduled lifecycle compensation triggers and scheduler jobs; retained verified-resource binding for production webhook triggers.

## Evidence

- `PYTHONPATH=backend python -m pytest -q backend/tests/test_ucp_*.py backend/tests/test_pipeline_template_router.py backend/tests/test_pipeline_template_trigger_permission.py backend/tests/test_pipeline_template_version.py`: `247 passed`.
- `python -m compileall -q app`: passed.
- `npm.cmd --prefix hr-portal/frontend run test -- --run src/views/ucp/PipelineTriggerConfigView.spec.ts`: `4 passed`.
- `npm.cmd --prefix hr-portal/frontend run build`: passed.
- Docker PostgreSQL migration: `0124 -> 0127 -> 0124 -> 0127`: passed.
- Docker PostgreSQL verification confirmed the offboarding template order: `effective_time -> approval -> disable -> notify`.
- Docker backend/frontend rebuilt successfully; backend `/openapi.json` returned `200`; frontend returned `200`.
- `git diff --check`: passed.
