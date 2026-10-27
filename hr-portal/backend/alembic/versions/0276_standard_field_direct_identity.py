"""Move standard definitions and confirmed mappings to stable field identities."""
from alembic import op
import sqlalchemy as sa

revision = "0276_standard_field_direct_identity"
down_revision = "0275_performance_cycle_templates"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("LOCK TABLE standard_fields, standard_field_versions, standard_field_version_categories, standard_field_bindings IN SHARE ROW EXCLUSIVE MODE")
    op.execute("""
        DO $$ BEGIN
            IF EXISTS (
                SELECT 1 FROM standard_fields f
                WHERE NOT EXISTS (SELECT 1 FROM standard_field_versions v WHERE v.standard_field_id=f.id)
            ) OR EXISTS (
                SELECT standard_field_id FROM standard_field_versions
                GROUP BY standard_field_id
                HAVING count(DISTINCT (business_definition, data_type, grain_level, permission_domain,
                    is_permission_anchor, coalesce(value_domain::jsonb, 'null'::jsonb))) > 1
            ) THEN
                RAISE EXCEPTION 'STANDARD_FIELD_IDENTITY_CONFLICT: resolve differing definitions before migration';
            END IF;
            IF EXISTS (
                SELECT 1 FROM standard_field_bindings b
                JOIN standard_field_versions v ON v.id=b.standard_field_version_id
                WHERE b.status='confirmed' AND v.status<>'active'
            ) THEN
                RAISE EXCEPTION 'STANDARD_FIELD_BINDING_INACTIVE: resolve confirmed mappings to inactive versions';
            END IF;
        END $$
    """)
    for column in (
        sa.Column("has_history", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("business_definition", sa.Text(), nullable=True),
        sa.Column("data_type", sa.String(16), nullable=True),
        sa.Column("value_domain", sa.JSON(), nullable=True),
        sa.Column("revision", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("grain_level", sa.String(16), nullable=True),
        sa.Column("permission_domain", sa.String(32), nullable=False, server_default="public"),
        sa.Column("is_permission_anchor", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    ):
        op.add_column("standard_fields", column)
    op.execute("""
        UPDATE standard_fields f SET has_history=true,
            display_name=coalesce(nullif(trim(f.display_name), ''), v.field_name),
            business_definition=v.business_definition, data_type=v.data_type, value_domain=v.value_domain,
            grain_level=v.grain_level, permission_domain=v.permission_domain,
            is_permission_anchor=v.is_permission_anchor,
            is_active=EXISTS (SELECT 1 FROM standard_field_versions a
                WHERE a.standard_field_id=f.id AND a.status IN ('draft','active'))
        FROM standard_field_versions v WHERE v.id=(
            SELECT id FROM standard_field_versions WHERE standard_field_id=f.id
            ORDER BY (status='active') DESC, version DESC LIMIT 1
        )
    """)
    op.alter_column("standard_fields", "display_name", nullable=False)
    op.alter_column("standard_fields", "business_definition", nullable=False)
    op.alter_column("standard_fields", "data_type", nullable=False)
    op.create_check_constraint("ck_standard_direct_definition", "standard_fields", "length(trim(display_name)) > 0 AND length(trim(business_definition)) > 0")
    op.create_check_constraint("ck_standard_direct_type", "standard_fields", "data_type IN ('string','number','date','datetime','bool','enum')")
    op.create_check_constraint("ck_standard_direct_revision", "standard_fields", "revision >= 0")
    op.create_table(
        "standard_field_categories",
        sa.Column("standard_field_id", sa.BigInteger(), sa.ForeignKey("standard_fields.id", ondelete="RESTRICT"), primary_key=True),
        sa.Column("field_category_id", sa.BigInteger(), sa.ForeignKey("field_categories.id", ondelete="RESTRICT"), primary_key=True),
    )
    op.execute("""
        INSERT INTO standard_field_categories(standard_field_id,field_category_id)
        SELECT DISTINCT v.standard_field_id,c.field_category_id
        FROM standard_field_versions v JOIN standard_field_version_categories c ON c.standard_field_version_id=v.id
    """)
    op.add_column("standard_field_bindings", sa.Column("standard_field_id", sa.BigInteger(), sa.ForeignKey("standard_fields.id", ondelete="RESTRICT"), nullable=True))
    op.execute("""
        UPDATE standard_field_bindings b SET standard_field_id=v.standard_field_id
        FROM standard_field_versions v WHERE b.standard_field_version_id=v.id
    """)
    op.drop_constraint("ck_standard_binding_confirmation", "standard_field_bindings", type_="check")
    op.create_check_constraint("ck_standard_binding_confirmation", "standard_field_bindings", """
        (status='unmapped' AND standard_field_id IS NULL AND confirmed_by IS NULL AND confirmed_at IS NULL)
        OR (status='suggested' AND standard_field_id IS NOT NULL AND confirmed_by IS NULL AND confirmed_at IS NULL)
        OR (status='confirmed' AND standard_field_id IS NOT NULL AND binding_version > 0
            AND confirmed_by IS NOT NULL AND confirmed_at IS NOT NULL AND observed_data_type IS NOT NULL
            AND length(trim(observed_data_type)) > 0)
        OR (status='invalid' AND ((confirmed_by IS NULL AND confirmed_at IS NULL) OR
            (standard_field_id IS NOT NULL AND binding_version > 0 AND confirmed_by IS NOT NULL AND confirmed_at IS NOT NULL)))
    """)
    op.execute("""
        CREATE OR REPLACE FUNCTION protect_standard_field_code() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
            IF NEW.field_code IS DISTINCT FROM OLD.field_code THEN
                RAISE EXCEPTION 'Standard field identity is immutable' USING ERRCODE='23514';
            END IF;
            IF NEW.data_type IS DISTINCT FROM OLD.data_type AND EXISTS (
                SELECT 1 FROM standard_field_bindings WHERE standard_field_id=OLD.id
            ) THEN
                RAISE EXCEPTION 'Referenced standard field type is immutable' USING ERRCODE='23514';
            END IF;
            RETURN NEW;
        END $$
    """)
    op.execute("""
        CREATE FUNCTION protect_standard_field_history() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
            RAISE EXCEPTION 'Standard field versions are retired evidence, not a writable catalog' USING ERRCODE='23514';
        END $$
    """)
    for table in ("standard_field_versions", "standard_field_version_categories"):
        op.execute(f"CREATE TRIGGER protect_retired_field_history BEFORE INSERT OR UPDATE OR DELETE ON {table} FOR EACH ROW EXECUTE FUNCTION protect_standard_field_history()")


def downgrade():
    raise RuntimeError("Standard field direct identities require a forward migration; downgrade would lose current definitions and mappings")
