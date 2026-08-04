# CR-001: PM-001 authorization hardening

## Scope

- Require an explicitly configured, strong performance super-admin bootstrap password.
- Rotate the legacy bootstrap password when a replacement is configured.
- Use a dedicated result-read action so 360 reviewers cannot read results and employees only read published results.
- Audit super-admin bootstrap, snapshot locks, and dynamic identity changes.
- Add service-level locks and PostgreSQL guards to freeze locked snapshot structures while allowing employment-status updates.
- Provide super-admin-only APIs to create, enable or disable, and reset performance-admin accounts.
- Require snapshot synchronization, dynamic-assignment replacement, and snapshot locking callers to provide the real audit actor.
- Replace the generic read action with explicit work-summary and result-read actions.
- Provide an authenticated-context request factory that resolves Portal users through the cycle snapshot and loads workflow state from persistence; object routes must not accept actor or state fields from request payloads.
- Persist one-to-one Portal-user-to-employee identity links, synchronize the mapping into the cycle snapshot, and provide performance-admin-only maintenance APIs.
- Derive 360-degree invitation origin from the trusted operator so an invitation cannot be represented as self-invited by a different caller.
- Persist object authorization state for each cycle employee record before evaluating object-level permissions.

## Non-scope

- Performance UI and cycle business workflows beyond the authorization-state boundary.
- Historical appeal data rules, which remain a prerequisite for the later appeals feature.

## Acceptance evidence

- Default bootstrap credentials are rejected for new or legacy accounts.
- Result-read authorization rejects 360 reviewers and unpublished self results.
- Database triggers reject structural mutations after snapshot lock.
- Admin account APIs require the standalone performance super-admin permission and write audit events.
- Identity-link APIs require performance.authorization.manage; a locked cycle reads its captured Portal-user mapping.
- Object authorization requests load actor and process state from persisted cycle data, and forged 360-degree invitation origins are rejected.
