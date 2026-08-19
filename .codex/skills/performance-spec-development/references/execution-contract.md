# Execution Contract

Use this contract for multi-agent or cross-layer performance work.

## Freeze Before Tasks

Before decomposing tasks, freeze the shared contracts:

- DTO names, versions, fields, enums, defaults, and unknown-field behavior;
- API URLs, methods, request/response schemas, status codes, and stable error codes;
- role/policy scope and RBAC versus business-policy precedence;
- adapter read/transform/write behavior and lossy-write handling;
- executor input/output, batch semantics, reference-data loading, and side effects;
- event envelope, idempotency, retry, audit, and notification behavior;
- source-of-truth, snapshot, binding, cache, and derived-data boundaries;
- transaction, concurrency, optimistic-lock, rollback, and migration boundaries.

Unresolved shared contracts are blockers. Implementation tasks must not invent local alternatives.

## File Boundaries

Every task must list required files to read, allowed files to modify, allowed new-file directories, forbidden files, shared files, and serial merge rules. An agent may modify only the listed files. Scope expansion requires the main agent's approval.

Typical performance shared files include performance route registration, `PerformanceLayout`, permission registries, cycle status services, common API types, review/result components, and the migration head chain. Do not modify the same shared file in parallel.

## Agent Rules

- One implementation agent owns one task or explicitly grouped task.
- Agents do not mark tasks complete.
- The main agent checks diff, tests, migration, boundaries, and evidence before marking `[x]`.
- Unreadable context, missing prerequisite, file conflict, or environment failure is reported as a blocker.
- Do not claim a test passed unless it actually ran.

## Assumption Safety

Minor presentation details may use minimal documented assumptions. Do not assume unresolved role scope, snapshot semantics, state transitions, DTO/API contracts, source-of-truth, migration behavior, permissions, audit, rollback, security, or external side effects. Mark them as blockers or ask focused questions.

## UI Evidence

For every UI task, generate one independent PNG under `specs/002-performance-management/ui-blueprints/`. Name it `<task-id>-<descriptive-kebab-case>.png`, for example `PM-T002-T02-implemented-settings-shell.png`. Do not reuse a PNG across unrelated tasks or overwrite another task's artifact. The task card must record the PNG path, and implementation acceptance must verify that the image represents the implemented UI rather than only a planned mockup.

## Cross-Artifact Check

Before finalizing, compare baseline documents, related Specs, actual models/APIs, permission names, status enums, snapshot semantics, task dependencies, test files/commands, and migration chain. Never silently choose between conflicting authorities.
