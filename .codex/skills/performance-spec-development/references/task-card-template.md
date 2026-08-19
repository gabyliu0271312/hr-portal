# Atomic Task Card

Use this template for every implementation task.

```markdown
- [ ] PM-xxx-Txx Task name
  - Goal: one verifiable primary outcome
  - Type: contract/backend/frontend/API/migration/adapter/business migration/test/documentation
  - Prerequisites:
  - Required reading:
  - Allowed modifications: exact paths
  - Allowed new files: exact directory and naming rule
  - Forbidden modifications: exact paths or protected boundaries
  - Shared files and merge rule:
  - Input contract:
  - Output contract:
  - UI: no UI, with rationale / route, fields, actions, states, transitions, blueprint path/version, independent PNG path, and implemented-UI validation
  - API/database/permission/external-system impact:
  - Test contract:
    - Given:
    - When:
    - Then:
    - Test files:
    - Commands:
    - skipped/not-run rule:
  - Acceptance: success, failure, permission, empty, boundary, compatibility, rollback, regression
  - Evidence: diff, fixture, test output, migration, UI validation, audit or data comparison
  - Blockers:
  - Non-scope:
  - Definition of done: development, UI, tests, acceptance, and evidence complete; only the main agent may check the task
```

Split a task when it combines independent contracts, APIs, rule types, lifecycle stages, callers, migrations, or test scopes. Keep contracts, backend, frontend, migration, and validation separable when they can fail independently.
