# Migration Coordination

- Create new migrations only; never edit an existing migration.
- State `revision` and `down_revision` and use a domain-purpose filename.
- One shared migration chain is owned by one task at a time; do not create parallel migrations for the same model.
- If multiple Alembic heads or unclear dependencies exist, stop and report the blocker; do not merge heads independently.
- Verify empty database, existing data, persistent database, upgrade, downgrade, and failure rollback.
- Record migration commands and real output in the task handoff.
