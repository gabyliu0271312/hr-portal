"""Stable user-facing metric field numbers independent of internal IDs."""
from alembic import op
import sqlalchemy as sa

revision = "0252_performance_metric_field_display_ids"
down_revision = "0251_performance_metric_field_ids"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("LOCK TABLE performance_metric_fields IN ACCESS EXCLUSIVE MODE")
    op.add_column("performance_metric_fields", sa.Column("display_id", sa.BigInteger(), nullable=True))
    op.execute("""
        WITH numbered AS (SELECT id, row_number() OVER (ORDER BY id) AS number FROM performance_metric_fields)
        UPDATE performance_metric_fields AS fields SET display_id = numbered.number
        FROM numbered WHERE fields.id = numbered.id
    """)
    op.alter_column("performance_metric_fields", "display_id", nullable=False)
    op.create_unique_constraint("uq_performance_metric_fields_display_id", "performance_metric_fields", ["display_id"])
    op.create_table(
        "performance_metric_field_counter",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("next_value", sa.BigInteger(), nullable=False),
        sa.CheckConstraint("id = 1 AND next_value > 0", name="ck_performance_metric_field_counter"),
    )
    op.execute("""
        INSERT INTO performance_metric_field_counter (id, next_value)
        SELECT 1, COALESCE(max(display_id), 0) + 1 FROM performance_metric_fields
    """)
    op.execute("""
        CREATE FUNCTION assign_performance_metric_field_display_id() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
            UPDATE performance_metric_field_counter SET next_value = next_value + 1 WHERE id = 1
            RETURNING next_value - 1 INTO NEW.display_id;
            IF NOT FOUND THEN RAISE EXCEPTION 'metric field counter is missing'; END IF;
            RETURN NEW;
        END;
        $$
    """)
    op.execute("""
        CREATE TRIGGER assign_performance_metric_field_display_id
        BEFORE INSERT ON performance_metric_fields
        FOR EACH ROW EXECUTE FUNCTION assign_performance_metric_field_display_id()
    """)


def downgrade():
    op.execute("DROP TRIGGER assign_performance_metric_field_display_id ON performance_metric_fields")
    op.execute("DROP FUNCTION assign_performance_metric_field_display_id()")
    op.drop_table("performance_metric_field_counter")
    op.drop_constraint("uq_performance_metric_fields_display_id", "performance_metric_fields", type_="unique")
    op.drop_column("performance_metric_fields", "display_id")
