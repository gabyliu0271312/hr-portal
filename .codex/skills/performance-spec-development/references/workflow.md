# Performance workflow reference

## Artifact routing

- Stable system boundary: update the root baseline documents.
- New capability: create `features/PM-xxx-name/`.
- Cross-feature change: create `changes/CR-xxx-name/`.
- Architecture choice: create `decisions/ADR-xxx-name.md`.
- New or complex UI: create a performance blueprint under `ui-blueprints/`.

## UI gate

Require blueprint confirmation before coding a new page, wizard, multi-role workbench, multi-state flow, or information-architecture change. Use `ui-interaction.md` for small changes that do not alter information architecture.

## Contract and task gates

Before decomposing cross-layer work, load `execution-contract.md` and freeze shared DTO, API, policy, adapter, executor, error-code, event, source-of-truth, transaction, and migration contracts. Resolve blockers before implementation; do not let agents invent local variants.

Every atomic task must use `task-card-template.md`. Identify exact allowed and forbidden files, shared-file serial merge rules, inputs, outputs, Given/When/Then tests, commands, evidence, blockers, and non-scope.

For any database work, load `migration-coordination.md`. For acceptance, load `acceptance-evidence.md` and separate passed, not-run, and blocked checks.

## Boundary rules

- Reuse Portal authentication and application entry only where the baseline contract allows it.
- Keep performance roles, workflow, cycle snapshots, result visibility, appeals, and audit rules inside the performance domain.
- Keep UCP, warehouse, PushTarget, and other executors/lifecycles separate; share contracts or adapters only when explicitly specified.
- Verify UI -> API -> service/database -> read/reopen behavior for persistence-sensitive changes.