"""Renumber built-in metric fields without changing their references' meaning."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = "0251_performance_metric_field_ids"
down_revision = "0250_performance_template_dimensions"
branch_labels = None
depends_on = None


def _renumber(changes):
    connection = op.get_bind()
    connection.execute(sa.text(
        "LOCK TABLE performance_metric_fields, performance_metric_types IN ACCESS EXCLUSIVE MODE"
    ))
    rows = {
        row["id"]: row
        for row in connection.execute(sa.text(
            "SELECT id, name, field_type, is_system FROM performance_metric_fields WHERE id IN (6, 7, 8)"
        )).mappings()
    }
    source_ids = {old for old, _, _, _ in changes}
    for old, new, name, field_type in changes:
        row = rows.get(old)
        if not row or row["name"] != name or row["field_type"] != field_type or not row["is_system"]:
            raise RuntimeError(f"Metric field {old} is not the expected built-in {name}; migration stopped")
        if new not in source_ids and new in rows:
            raise RuntimeError(f"Metric field target ID {new} is occupied; migration stopped")

    for old, new, _, _ in changes:
        connection.execute(sa.text(
            "UPDATE performance_metric_fields SET id = :new WHERE id = :old"
        ), {"old": old, "new": new})

    first, second = changes
    result = connection.execute(sa.text("""
        UPDATE performance_metric_types AS types
        SET field_ids = (
            SELECT jsonb_agg(
                CASE element
                    WHEN to_jsonb(CAST(:old_first AS bigint)) THEN to_jsonb(CAST(:new_first AS bigint))
                    WHEN to_jsonb(CAST(:old_second AS bigint)) THEN to_jsonb(CAST(:new_second AS bigint))
                    ELSE element
                END ORDER BY ordinal
            )
            FROM jsonb_array_elements(types.field_ids) WITH ORDINALITY AS entries(element, ordinal)
        )
        WHERE types.field_ids @> jsonb_build_array(CAST(:old_first AS bigint))
           OR types.field_ids @> jsonb_build_array(CAST(:old_second AS bigint))
    """), {
        "old_first": first[0], "new_first": first[1],
        "old_second": second[0], "new_second": second[1],
    })
    audit = sa.table(
        "performance_audit_events",
        sa.column("event_type", sa.String), sa.column("actor_type", sa.String),
        sa.column("actor_ref", sa.String), sa.column("subject_type", sa.String),
        sa.column("subject_ref", sa.String), sa.column("before_state", JSONB),
        sa.column("after_state", JSONB),
    )
    connection.execute(audit.insert().values(
        event_type="PERFORMANCE_METRIC_FIELD_IDS_RENUMBERED",
        actor_type="SYSTEM",
        actor_ref=f"alembic:{revision}",
        subject_type="PERFORMANCE_METRIC_FIELDS",
        subject_ref="builtin",
        before_state={"fields": [{"id": old, "name": name} for old, _, name, _ in changes]},
        after_state={
            "fields": [{"id": new, "name": name} for _, new, name, _ in changes],
            "id_mapping": {str(old): new for old, new, _, _ in changes},
            "updated_metric_types": result.rowcount,
        },
    ))


def upgrade():
    _renumber([(7, 6, "完成说明", "text"), (8, 7, "指标评价人", "person")])


def downgrade():
    _renumber([(7, 8, "指标评价人", "person"), (6, 7, "完成说明", "text")])
