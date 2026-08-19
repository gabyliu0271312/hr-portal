---
name: performance-spec-development
description: Use when discussing, specifying, implementing, testing, or accepting performance-management work in the HR Portal project, especially tasks referring to specs/002-performance-management, performance cycles, reviews, projects, appeals, performance permissions, employee snapshots, or PerformanceLayout.
---

# Performance Spec Development

Use this skill to govern long-running performance-management work as a modular business application inside the HR Portal. Keep requirements, UI decisions, API contracts, data models, atomic tasks, implementation scope, and acceptance evidence connected. For cross-layer or multi-agent work, load [execution-contract.md](references/execution-contract.md), [task-card-template.md](references/task-card-template.md), [acceptance-evidence.md](references/acceptance-evidence.md), and [migration-coordination.md](references/migration-coordination.md).

## Start With Context

1. Confirm the repository root and the actual Git root.
2. Read `specs/002-performance-management/START_HERE.md`.
3. Read the relevant baseline files before proposing changes: `overview.md`, `integration.md`, `permission-model.md`, `data-model.md`, `workflow-design.md`, `roadmap.md`, and `open-questions.md`.
4. Read the current feature directory, related ADRs, existing routes, API modules, models, migrations, and tests.
5. Inspect the worktree before editing. Preserve unrelated uncommitted changes.
6. If the task involves any UI, follow the root `AGENTS.md` reading gate for Spec 012: read its `START_HERE.md`, relevant `ui-interaction.md`, `ui-implementation-guardrails.md`, and the applicable atomic-task UI checks before designing or coding. If the task also involves UCP, data ingestion, data assets, Pipeline, Webhook, DataSource bridging, or another external system, read the required Spec 011/012 documents as well.
7. Before decomposing cross-layer work, freeze shared DTO, API, policy, adapter, executor, error-code, event, source-of-truth, transaction, and migration contracts. Read `references/execution-contract.md`; unresolved shared contracts block implementation.

Do not infer existing behavior from the user request alone. Report missing context, contradictions, and assumptions.

For persistence-sensitive work, verify cycle-start snapshots, historical-data boundaries, and read/reopen behavior; current roster or organization changes must not silently rewrite a started cycle.

## Classify The Request

Classify the request as one of:

- new business capability;
- enhancement to an existing capability;
- bug fix;
- permission or security change;
- data migration;
- UI change;
- architecture decision;
- UCP or external-system integration.

Choose the smallest appropriate artifact:

- New capability: `specs/002-performance-management/features/PM-xxx-name/`.
- Cross-feature or small scope change: `specs/002-performance-management/changes/CR-xxx-name/`.
- Long-term architecture choice: `specs/002-performance-management/decisions/ADR-xxx-name.md`.
- Small bug or test-only work: update the related feature task or change record without creating a full new feature specification.

Do not create arbitrary files directly in the Spec root when a feature, change, or decision artifact is appropriate.

## Automatically Triage Minimal Input

Accept natural-language requests. Do not require the user to copy a template or choose a mode before starting.

Infer the mode from the request and state the inference at the start of the response:

| User intent | Inferred mode | Default action |
|---|---|---|
| Requests discussion, recommendation, or approach | discussion | Read context, analyze boundaries, list material decisions, and do not edit code. |
| Requests requirements, documentation, task breakdown, or specification | specification | Locate or create the appropriate Spec artifact, write/update the specification, and do not edit business code. |
| Requests development, implementation, or a fix | implementation | Require a confirmed feature/task and UI confirmation when applicable before editing code. |
| Requests acceptance, testing, or completion checking | acceptance | Verify the implementation against the specification, blueprint, API, persistence, and task evidence. |

Infer the target artifact in this order:

1. Use an explicit `PM-xxx`, `CR-xxx`, `ADR-xxx`, file path, or atomic task ID supplied by the user.
2. Search existing feature, change, and decision artifacts for a matching business term.
3. If there is no match and the request is discussion-only, treat it as an unfiled intake and propose the next artifact without creating it.
4. If there is no match and the request is specification work, allocate the next sequential `PM-xxx` or `CR-xxx` identifier, create the smallest appropriate directory, copy or instantiate the relevant template, and state the chosen name.
5. If the request is implementation work without a confirmed task or unambiguous existing specification, stop at scope clarification; do not create business code from assumptions.

Use this default sequence for a new capability:

```text
natural-language request
-> classify and inspect context
-> create/update intake and feature specification
-> identify open decisions
-> create/confirm UI blueprint when required
-> create atomic tasks
-> implement one confirmed task at a time
-> validate and update evidence
```

Do not force the user to provide all template fields up front. Extract what is available, record the remaining items in the assumptions and open-questions section, and ask only questions that materially block specification or implementation.

## Require Clarification Before Formal Specification

Before creating or updating a formal feature specification, check whether the request leaves material business decisions unresolved. Treat the following as blocking unless the baseline specification already answers them:

- role definition, role source, authorization scope, or role overlap;
- which data each role can view, edit, submit, adjust, or publish;
- cycle snapshot versus real-time relationship behavior;
- person, organization, project, or external identity source;
- state transitions, irreversible actions, calculation rules, or exception handling;
- new-page information architecture, workflow steps, or required UI behavior.

When one or more blockers exist:

1. State that the request is in clarification mode, even if the user requested a specification.
2. Summarize only the facts already confirmed from the user and existing documents.
3. Ask the smallest set of concrete questions that can unblock the next decision; group related questions and normally ask no more than five at once.
4. Do not create a formal feature directory, specification, atomic-task file, UI blueprint, or business code.
5. Wait for the user's answer or an explicit instruction to proceed with documented assumptions.

Only after the user answers the blocking questions, or explicitly says to proceed with stated assumptions, create the formal specification and task artifacts. Mark every remaining assumption as unresolved; never present it as a confirmed requirement.

If a prior run created an artifact before clarification, preserve it as a draft. Add or update its status to `pending clarification`, list the blockers, and do not use it as implementation authority until the user confirms it.

## Automatically Apply The UI Gate

Decide UI impact from the requested behavior rather than waiting for the user to label it:

- Treat routes, pages, dashboards, workbenches, forms, wizards, tables, buttons, role-visible actions, page transitions, and user feedback as UI work.
- Treat a new page, complex form/wizard, multi-role workbench, multi-state workflow, or information-architecture change as blueprint-required.
- In blueprint-required work, generate or update the performance UI blueprint and confirmation record, then wait for the user's explicit confirmation before formal UI coding.
- Treat backend-only work, migrations, tests, copy changes, validation fixes, and small UI changes that preserve information architecture as blueprint-not-required; record UI impact in the feature interaction document instead.
- For any UI work in this repository, read the Spec 012 UI gate required by the root `AGENTS.md`. Use Spec 011 blueprints as illustrative references only unless the task itself concerns UCP.
## Select The Work Mode

Determine whether the user asks for discussion, specification, implementation, or acceptance.

### Discussion Mode

- Read context and identify conflicts.
- Ask or list only the questions that materially affect scope, data, permissions, workflow, or UI.
- State assumptions explicitly.
- Do not edit code.

### Specification Mode

- Run the clarification gate before creating formal Markdown artifacts.
- If material decisions are unresolved, ask questions and wait; do not write a feature specification merely to fill gaps.
- After confirmation, update or create the smallest appropriate Markdown artifacts.
- Define background, goals, non-goals, roles, scenarios, boundaries, impact matrix, data, APIs, business rules, permissions, UI, tests, acceptance, risks, and open questions.
- Split large work into independently testable atomic tasks.
- Do not mark a task confirmed or complete without evidence.

### Implementation Mode

Before coding, output the development-start confirmation:

- current Spec, feature directory, and atomic task;
- files and specifications read;
- scope to modify;
- explicit non-scope;
- UI, migration, permission, UCP, and external-system impact;
- confirmed assumptions and blockers;
- planned tests and acceptance evidence.

Implement only confirmed atomic tasks. Preserve unrelated changes and avoid adjacent refactors.

### Acceptance Mode

Trace the change from UI to actual API payload, service/database behavior, and reopen/read behavior when applicable. Run focused tests first, then broader validation when appropriate. Report passed, not-run, and blocked checks separately.

## Require UI Blueprint Before UI Coding

For a new page, complex form or wizard, multi-role workbench, multi-state workflow, major information-architecture change, or new page-to-page flow:

1. Create or update a performance blueprint in `specs/002-performance-management/ui-blueprints/`.
2. Generate an independent PNG visual artifact for every UI task. Use the task ID and a descriptive kebab-case name in the filename, for example `PM-T002-T02-implemented-settings-shell.png`; never reuse one PNG for unrelated UI tasks or silently overwrite another task's evidence.
3. Record the blueprint path, PNG path, page route, roles, entry, layout, fields, buttons, loading state, empty state, error state, forbidden state, success feedback, transitions, and dangerous-action confirmation.
4. Use the UCP blueprints only as visual and interaction examples unless the task actually touches UCP.
5. Wait for explicit user confirmation of the blueprint before starting formal UI implementation.
6. After implementation, update the task evidence with the actual PNG path and confirm that the visual artifact corresponds to the implemented UI, not only the planned design.

The UI confirmation must identify:

- blueprint path and version;
- affected routes and roles;
- confirmed states and transitions;
- task IDs covered by the blueprint;
- unresolved UI questions.

A task may not begin formal UI implementation until the referenced blueprint version is explicitly confirmed.

Do not require a new full HTML blueprint for a backend-only change, migration, test-only change, copy change, validation fix, or small adjustment that does not change information architecture. Update `ui-interaction.md` when a smaller UI change needs a record.

## Produce Complete Specifications

For a feature, use the templates in `specs/002-performance-management/templates/` and create only the files that apply. At minimum, cover:

- background, goal, non-goals, roles, scenarios, and scope;
- database schema, indexes, defaults, migration, downgrade, and old-data compatibility;
- API URLs, methods, request/response schemas, permissions, status codes, and errors;
- state transitions, transaction boundaries, idempotency, concurrency, and failure handling;
- frontend routes, layout, field rules, buttons, states, feedback, and accessibility considerations;
- HR Portal entry permission versus performance-internal permission;
- sensitive data, masking, query safety, external-system boundary, and auditability;
- focused tests, regression tests, build checks, and acceptance evidence;
- assumptions, unresolved questions, dependencies, risks, and rollback plan.

Treat cycle-start snapshots as historical data. Do not let current roster or organization changes silently rewrite a started performance cycle. For every workflow or status change, define current state, action, actor/permission, preconditions, next state, error code, retryability, and audit event.

## Atomic Task Rules

Use IDs such as `PM-001-T01`. Keep each task focused on one primary deliverable. Load [task-card-template.md](references/task-card-template.md) and include prerequisites, required reading, allowed/forbidden files, input/output contracts, shared-file merge rules, UI/API/database/permission/external-system impact, Given/When/Then tests, acceptance criteria, completion evidence, blockers, non-scope, and definition of done.

Keep database migration, backend contract, permission logic, frontend implementation, UI validation, and regression testing separable when they can fail independently. An implementation agent may modify only the task-card files; scope expansion requires the main agent's approval.

## Multi-Agent Coordination

- One implementation agent owns one task or explicitly grouped task.
- Do not modify the same shared file in parallel.
- Agents must report missing prerequisites, contract gaps, file conflicts, or environment failures as blockers.
- Agents must not mark tasks complete. The main agent checks diff, tests, migration, boundaries, and evidence before marking `[x]`.
- Never report an unrun or skipped test as passed.

## Migration Coordination

Load [migration-coordination.md](references/migration-coordination.md) for any database change. Create new migrations only, never edit existing migrations, and stop on multiple Alembic heads or unclear dependencies.

## Acceptance Evidence

Load [acceptance-evidence.md](references/acceptance-evidence.md). Every task needs executable Given/When/Then coverage and real test files/commands. Report passed, not-run, and blocked checks separately. For persistence-sensitive changes trace UI → actual API payload → service/database → read/reopen.

## Cross-Artifact Consistency

Before finalizing a specification or acceptance result, compare baseline documents, related Specs, actual models/APIs, permission names, status enums, snapshot semantics, task IDs and dependencies, test files and commands, migration chain, UI routes/components, and external-system boundaries. Never silently choose between conflicting authorities; record the conflict as a blocker and identify the authoritative source.

## Release Blocking Criteria

Do not declare the feature complete when any required task lacks evidence, permission lacks allow/deny coverage, a historical snapshot can be silently rewritten, an adapter loses fields, migration upgrade/downgrade is unverified, a required UI blueprint is unconfirmed, an unresolved P0/P1 contradiction remains, or completion depends only on local tests for a production claim.



Only mark `[x]` after development, migration, UI validation, tests, acceptance, and evidence are complete. Update the feature task file and any stage-level roadmap/status index. Use [task-card-template.md](references/task-card-template.md) for the structured handoff and report:

- completed task IDs;
- required reading and protected files not modified;
- added and modified files;
- input/output contracts, compatibility behavior, error codes, and side-effect boundaries;
- test/build commands with actual results and skipped/warnings;
- UI blueprint/version and validation result;
- migration status and real upgrade/downgrade evidence;
- fixtures, audit, regression, or data-comparison evidence;
- uncompleted tasks and blockers;
- known risks and deployment steps;
- whether the main agent should check the task and why.

Never claim production deployment from local tests alone. Never claim tests passed unless they actually ran.
