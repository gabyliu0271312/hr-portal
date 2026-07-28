# UCP 011 atomic task ledger

## X02 implementation contract

- New webhook configuration stores credential references only; plaintext secrets are prohibited.
- Existing `data-objects` endpoints remain compatible and expose `object_type`.
- Production webhook triggers only bind verified, active `EVENT_TYPE` objects with published definitions.
- A pipeline canvas begins with exactly one `START_TRIGGER` group node. The group represents OR semantics across configured triggers; it never stores webhook paths or secrets.
- Webhook configuration remains a system -> verified resource -> published event object cascade. Schedule, manual, platform-event, and data-change entry points are configured as trigger records and rendered inside the start group.

## Completed tasks

- [x] X0213 Resource-object generalization and compatible migration
- [x] X0214 Versioned event definitions and contract validation
- [x] X0215 Webhook ingress resources and event-object verification
- [x] X0216 Unified pipeline triggers and scoped dispatch
- [x] X0217 Client trigger/resource-object API integration
- [x] X0218 Event traceability and controlled event APIs
- [x] X0219 Lifecycle event ingress compatibility
- [x] X0220 Legacy trigger/object compatibility and delivery review
- [x] X0221 Canvas-native trigger start group and lifecycle entry refactor
- [x] X0222 Unified pipeline node catalog, configuration contract, and graph execution refactor
  - Scope: backend-owned catalog for palette metadata, stable `Nxx` codes, four-character Chinese labels, configuration schemas, validation, and executor support.
  - Required node set: `N01` through `N13`, covering start, resource, capability, data, and control nodes.
  - Contract: every palette node is configurable, save-validatable, executable, and traceable; `edges_json` determines deterministic topological execution order.
  - Acceptance: catalog, template validation, frontend type union, palette, seed template, and engine dispatch have no type mismatch; data-change remains planned and non-selectable.

## Validation

- [x] Backend UCP/template regression: 256 passed
- [x] Backend compile check
- [x] Frontend component test: 4 passed
- [x] Frontend production build
- [x] Migration upgrade 0124 -> 0127, downgrade 0127 -> 0124, then upgrade 0124 -> 0127
- [x] Migration upgrade 0127 -> 0128, downgrade 0128 -> 0127, then upgrade 0127 -> 0128
- [x] Migration upgrade 0128 -> 0129, downgrade 0129 -> 0128, then upgrade 0128 -> 0129
- [x] Docker backend/frontend rebuild and runtime verification
- [x] X0223 Graph-route and approval-gate review remediation
  - Scope: execute `edges_json.condition` at runtime; require an explicit true/false edge pair for each canvas BRANCH; render route selection in the designer.
  - Safety: unsupported route expressions fail closed, approval creation failures fail closed, and a waiting approval stops all downstream nodes.
  - Acceptance: branch routing, safe expression handling, approval request creation, UCP regression, backend compile, and frontend build pass.
- [x] X0224 Four-character node naming normalization
  - Contract: `N01`?`N13` four-character catalog labels are immutable visual type names; canvas headers must render `Nxx ? ?????`.
  - Compatibility: legacy or business-specific labels are migrated to `config.business_alias` and displayed only as secondary text.
  - Acceptance: all saved template/version nodes use four-character `label` values; upgrade/downgrade/upgrade of migration `0130` and frontend build pass.
- [x] X0225 Node library visibility and runtime image refresh
  - `START_TRIGGER` is visible in the node library as `N01 ? ????` with a fixed/locked indicator; it cannot be dragged, deleted, or duplicated.
  - Business aliases are retained only for backward-compatible data preservation and are not rendered in the canvas or editor.
  - Acceptance: backend/frontend containers rebuilt and force-recreated; runtime metadata returns 13 node types including locked `START_TRIGGER`; full UCP regression passes.
- [x] X0226 Frontend node library semantics optimization
  - Frontend hides internal `Nxx` type codes and `business_alias` values; only four-character node names are displayed.
  - The node library separates the visible fixed `????` from 12 draggable orchestration node types.
  - Node ordering is defined exclusively by canvas edges, never by type code or palette order.
  - Acceptance: 262 UCP/template tests pass, frontend production build passes, and rebuilt runtime containers verify one fixed start plus 12 draggable types.
- [x] X0227 User-placed start trigger interaction correction
  - Scope: retain the visible fixed-node area while allowing the start trigger to be dragged, moved, and removed by the user like all other canvas nodes.
  - Contract: neither a new canvas nor an opened template silently inserts a start node; the client prevents duplicate placement and backend graph validation remains the final exactly-one guard.
  - Acceptance: `15` start-trigger graph tests and `262` UCP/template regressions pass; frontend production build passes; rebuilt runtime metadata verifies `13` palette types, including one unlocked start type and `12` other palette types.
- [x] X0228 Start-trigger Chinese cascading selector
  - Scope: replace the legacy English explanation and entry-mode checkboxes with compact Chinese selectors for trigger mode, source system, source resource, and bound trigger.
  - Contract: selector values filter existing pipeline trigger records only; the trigger-management record remains the sole runtime binding authority, so canvas selection cannot create a non-routable trigger.
  - Acceptance: old English explanations and checkbox controls are absent; Chinese trigger labels, empty states, actions, and canvas summaries are present; frontend production build and rebuilt runtime frontend pass.
- [x] X0229 Trigger classification and shared schedule integration
  - Scope: make schedule and data-change parallel trigger concepts; reuse the shared schedule selector for UCP scheduled triggers and prefill trigger configuration from the pipeline designer.
  - Contract: scheduled UCP triggers create `ucp_pipeline_trigger` jobs; data-change remains visible but disabled until the datasource completion event has a verified UCP bridge.
  - Acceptance: shared-selector output and legacy cron are accepted by the common scheduler parser; `17` trigger-focused tests and `262` UCP/template regressions pass; frontend production build passes; rebuilt runtime frontend is healthy.
- [x] X0230 Scheduled-trigger direct interaction
  - Scope: when the start node selects scheduled execution, hide irrelevant source and bound-trigger selectors; display schedule status and one direct configure/manage action.
  - Contract: the action requires a saved workflow and routes to the prefilled schedule-trigger editor; existing plans are summarized without treating them as a second selection step.
  - Acceptance: frontend production build passes and the rebuilt runtime frontend is healthy.
- [x] X0231 Scheduled-plan ownership and inline editor
  - Scope: show schedule ownership explicitly, render business-readable schedule summaries, and replace the canvas entry's generic Trigger editor with an inline schedule-plan configuration strip.
  - UI blueprint: UCP Pipeline Designer start-node configuration (U00/UCP event-trigger boundary); the inline strip contains only the schedule selector and an optional enabled state.
  - Contract: the inline strip auto-manages Trigger code, name, pipeline, type, timezone, failure policy, and service account; it must not delete or overwrite an existing plan outside the user's selected plan.
  - Acceptance: no raw Cron expression appears in the canvas summary; unconfigured, one-plan, and multi-plan states are distinguishable; frontend component tests and production build pass; backend trigger tests and rebuilt runtime containers pass.
- [x] X0232 Independent schedule plans and immediate preview
  - Scope: remove all auto-created schedule plans; selecting a plan in the start-node editor immediately renders a Chinese `待保存` preview in both the editor and canvas card.
  - Contract: each schedule record belongs only to the current pipeline and is created only after the user saves it. Cleanup removes only untouched legacy seed schedules and their scheduler jobs; modified user plans remain intact.
  - Acceptance: a new pipeline has no schedule record by default; no API or UI exposes a system-preset marker; selection is visible before save; UCP/Pipeline regressions, frontend tests/build, and rebuilt runtime containers pass.
- [x] X0233 Platform-event hierarchy and warehouse bridge
  - Scope: remove top-level data-change triggering; provide a platform-event catalog with category, source, concrete event, and contract-bound filter fields; bridge warehouse completion and ODS data-change events into the UCP internal-event bus.
  - UI blueprint: Pipeline Designer start-node configuration uses `平台事件 → 事件分类 → 事件来源 → 具体事件 → 筛选条件` and does not expose an un-routable placeholder.
  - Contract: PLATFORM_EVENT stores `INTERNAL + platform_event_type`; only enabled catalog events and their allowed filter fields are accepted. Data changes are the `DATA_CHANGE` category under platform events, not a peer trigger type.
  - Acceptance: sync completion and ODS data change reach `process_event_pipeline`; invalid catalog events/filters are rejected; the start node no longer displays a top-level data-change option; backend/frontend tests, production build, and rebuilt containers pass.
- [x] X0234 Canvas readability and start-trigger configuration separation
  - Scope: move all start-trigger form controls out of the canvas card into the right property panel; standardize node card dimensions and summaries; render directed arrowed edges and provide deterministic layout actions; use pointer-anchored mouse-wheel zoom as the primary canvas scale interaction; support blank-canvas panning and fixed viewport controls; route persisted edges through dynamic four-side anchors; provide one context-aware whole-workflow smart-layout action without node selection; preserve intentional U-shaped and L-shaped paths while aligning and distributing their same-axis segments.
  - UI blueprint: `webhook-trigger-resource-object-componentization-development-spec.md` → `X0234 流程画布可读性与起点配置分离契约`.
  - Contract: the canvas never stores additional trigger state; it renders only draft or saved summaries from the existing Trigger records. Platform-event cascading configuration remains in the existing right-panel form and preserves backend catalog validation.
  - UI addendum: `x0234-wheel-zoom-interaction.md`.
  - Tests: add or update frontend component coverage for the start-node mode branches, directed-edge markers, fixed node-card sizing, summary rendering, mouse-wheel zoom bounds, pointer anchoring, blank-canvas panning, fixed viewport controls, horizontal and vertical edge anchors, direction-aware smart-layout spacing, U-shaped path preservation, same-axis alignment/distribution, straight collinear arrows, and reduced right-bottom controls; run frontend tests/build plus UCP/Pipeline regressions and rebuilt runtime containers.
  - Acceptance: platform-event controls are visible only in the right panel; existing manual/schedule/webhook triggers cannot obscure them; nodes retain fixed dimensions; all persisted edges have visible arrows; opening either seeded business pipeline automatically resolves overlaps; manually positioned horizontal, vertical, and reverse-direction edges select visible dynamic anchors; one Smart layout action is visibly labeled Smart layout, infers and preserves a clear current main direction while aligning and distributing the whole workflow without node selection, and preserves intentional U-shaped or L-shaped path turns; pointer-anchored mouse-wheel zoom and blank-canvas panning are primary navigation interactions; reset, fit, and center controls remain fixed at the visible canvas bottom-right and operate in the shared canvas coordinate system.

- [x] X0235 Connector catalog hierarchy correction
  - Scope: retain three platform catalog categories while separating them from business onboarding; `INSTANCE_RESOURCE` must be created only under an existing system's resource management.
  - Acceptance: add-system UI exposes only system-creating categories, backend rejects resource packages as systems, catalog management explains configuration location, and frontend/backend runtime validation passes.

## Planned tasks

- [x] X0253 Unified type-level action domain contract
  - Contract: replace new system-scoped actions with immutable package-scoped read-action versions; define category boundaries, state transitions, template/Pipeline version references, and legacy compatibility.
- [x] X0254 Samples, business errors, and migration compatibility
  - Contract: persist only masked, permission-filtered current samples with stable field IDs, schema invalidation, audit, and upgrade/downgrade/upgrade coverage.
- [x] X0255 Catalog visual read-action editor
  - Contract: define only `GET` and query-style `POST` actions in the connector catalog; disallow request Header form fields and all write methods.
- [x] X0256 Catalog test instance and publication lifecycle
  - Contract: draft packages may use isolated catalog test instances; they cannot be selected by Pipelines or production capability lists; publishing requires separate approver identity.
- [x] X0257 System capability enablement and legacy action retirement
  - Contract: systems enable/test only published type-level versions; all legacy custom-operation write endpoints return `OPERATION_SCOPE_RETIRED`; existing references remain runnable.
- [x] X0258 Sample-driven mapping and deterministic matching
  - Contract: save versioned scalar field-ID mappings; suggestions never overwrite user mappings or send samples to external models.
- [x] X0259 Structured conditions and fail-closed compiler
  - Contract: replace editable conditions with versioned AST rules; legacy `ctx.*` conditions remain compatible only for existing unchanged flows.
- [x] X0260 Side-effect-free dry-run results
  - Contract: reuse the formal Pipeline engine, execute only allowed reads, mark all side-effect nodes `SKIPPED_SIDE_EFFECT`, and expose only masked business results.

> Detailed scope, DTOs, migration rules, UI requirements, tests, and acceptance criteria are defined in `connector-catalog-unified-action-configuration-development-spec.md`.
