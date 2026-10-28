"""Add entity definition identity and explicit standard-field ownership."""
from alembic import op
import sqlalchemy as sa

revision = "0281_master_entity_definitions"
down_revision = "0280_app_identity_switch"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "master_entity_definitions",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("entity_code", sa.String(64), nullable=False),
        sa.Column("name", sa.String(128), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("owner_user_id", sa.BigInteger(), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("entity_code", name="uq_master_entity_code"),
        sa.CheckConstraint("entity_code ~ '^[a-z][a-z0-9_]{0,63}$'", name="ck_master_entity_code"),
        sa.CheckConstraint("length(trim(name)) > 0 AND length(trim(description)) > 0", name="ck_master_entity_definition"),
        sa.CheckConstraint("revision >= 0", name="ck_master_entity_revision"),
    )
    op.create_index("ix_master_entity_definitions_owner_user_id", "master_entity_definitions", ["owner_user_id"])
    op.add_column("standard_fields", sa.Column("entity_id", sa.BigInteger(), nullable=True))
    op.create_foreign_key("fk_standard_field_entity", "standard_fields", "master_entity_definitions", ["entity_id"], ["id"], ondelete="RESTRICT")
    op.create_index("ix_standard_fields_entity_id", "standard_fields", ["entity_id"])
    op.create_check_constraint("ck_standard_identifier_type", "standard_fields",
        "field_code NOT IN ('employee_no','mobile_phone','bank_card_number') OR data_type='string'")
    op.execute("""
        CREATE FUNCTION protect_master_entity_identity() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
            IF NEW.id IS DISTINCT FROM OLD.id OR NEW.entity_code IS DISTINCT FROM OLD.entity_code
                OR NEW.owner_user_id IS DISTINCT FROM OLD.owner_user_id THEN
                RAISE EXCEPTION 'Entity configuration identity is immutable' USING ERRCODE='23514';
            END IF;
            RETURN NEW;
        END $$
    """)
    op.execute("""
        CREATE TRIGGER protect_master_entity_identity BEFORE UPDATE ON master_entity_definitions
        FOR EACH ROW EXECUTE FUNCTION protect_master_entity_identity()
    """)
    op.execute("""
        CREATE FUNCTION protect_standard_field_entity() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
            IF NEW.entity_id IS DISTINCT FROM OLD.entity_id AND
                (OLD.entity_id IS NOT NULL OR EXISTS (SELECT 1 FROM standard_field_bindings WHERE standard_field_id=OLD.id)) THEN
                RAISE EXCEPTION 'Referenced or assigned field ownership cannot be changed' USING ERRCODE='23514';
            END IF;
            RETURN NEW;
        END $$
    """)
    op.execute("""
        CREATE TRIGGER protect_standard_field_entity BEFORE UPDATE ON standard_fields
        FOR EACH ROW EXECUTE FUNCTION protect_standard_field_entity();
    """)


def downgrade():
    raise RuntimeError("Entity definitions and field identities require a forward migration; automatic downgrade is disabled")
