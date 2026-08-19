# Acceptance Evidence

Every task must have executable Given/When/Then coverage where applicable:

- success and validation failure;
- empty or missing resource;
- permission allow/deny;
- invalid state transition;
- concurrent update and optimistic-lock conflict;
- cycle-start snapshot and historical-data boundary;
- legacy read/reopen/write and unknown-field preservation;
- lossy-write blocking;
- rollback;
- sensitive-data masking;
- external failure, retry, idempotency, audit, and notification dedupe.

Name the real test file and command. Missing files, skipped tests, unavailable environments, and unrun commands are `not-run` or `blocked`, never passed.

## Completion blockers

Do not declare complete when any required task lacks evidence, permission lacks allow/deny coverage, a historical snapshot can be silently rewritten, an adapter loses fields, migration upgrade/downgrade is unverified, a required UI blueprint is unconfirmed, or a P0/P1 contradiction remains.

## Acceptance trace

For persistence-sensitive work verify:

```text
UI → actual API payload → service/database → read/reopen
```

Also verify state transitions, permissions, and external retries whenever those concerns are in scope. Report passed, not-run, and blocked checks separately.
