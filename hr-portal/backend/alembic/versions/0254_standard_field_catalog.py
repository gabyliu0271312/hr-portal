"""Versioned semantic catalog; no authorization or conversion-body changes."""
from alembic import op
import sqlalchemy as sa

revision = "0254_standard_field_catalog"
down_revision = "0253_table_scope_classification"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "standard_fields",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("field_code", sa.String(64), nullable=False),
        sa.Column("created_by", sa.BigInteger(), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("field_code", name="uq_standard_field_code"),
        sa.CheckConstraint("length(trim(field_code)) > 0", name="ck_standard_field_code"),
    )
    op.create_table(
        "standard_field_versions",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("standard_field_id", sa.BigInteger(), sa.ForeignKey("standard_fields.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("revision", sa.Integer(), server_default="0", nullable=False),
        sa.Column("field_name", sa.String(128), nullable=False),
        sa.Column("business_definition", sa.Text(), nullable=False),
        sa.Column("data_type", sa.String(16), nullable=False),
        sa.Column("grain_level", sa.String(16), nullable=True),
        sa.Column("permission_domain", sa.String(32), nullable=False),
        sa.Column("is_permission_anchor", sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.Column("owner_user_id", sa.BigInteger(), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("value_domain", sa.JSON(), nullable=True),
        sa.Column("status", sa.String(16), server_default="draft", nullable=False),
        sa.Column("created_by", sa.BigInteger(), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("approved_by", sa.BigInteger(), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=True),
        sa.Column("approved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("approval_reason", sa.Text(), nullable=True),
        sa.Column("status_reason", sa.Text(), nullable=True),
        sa.Column("status_changed_by", sa.BigInteger(), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=True),
        sa.Column("status_changed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("standard_field_id", "version", name="uq_standard_field_version"),
        sa.CheckConstraint("version > 0", name="ck_standard_field_version_number"),
        sa.CheckConstraint("revision >= 0", name="ck_standard_field_revision"),
        sa.CheckConstraint("length(trim(field_name)) > 0 AND length(trim(business_definition)) > 0", name="ck_standard_field_definition"),
        sa.CheckConstraint("data_type IN ('string','number','date','datetime','bool','enum')", name="ck_standard_field_type"),
        sa.CheckConstraint("grain_level IS NULL OR grain_level IN ('coarse','fine','identifying')", name="ck_standard_field_grain"),
        sa.CheckConstraint("permission_domain IN ('public','org','cost_center','salary','personal')", name="ck_standard_field_domain"),
        sa.CheckConstraint("status IN ('draft','active','deprecated','archived')", name="ck_standard_field_status"),
        sa.CheckConstraint(
            "NOT is_permission_anchor OR (data_type='string' AND permission_domain IN ('org','cost_center') "
            "AND grain_level IS NOT NULL AND grain_level IN ('coarse','fine'))", name="ck_standard_field_anchor"
        ),
        sa.CheckConstraint(
            "(status IN ('draft','archived') AND approved_by IS NULL AND approved_at IS NULL AND approval_reason IS NULL) "
            "OR (status IN ('active','deprecated','archived') AND approved_by IS NOT NULL AND approved_at IS NOT NULL "
            "AND approval_reason IS NOT NULL AND length(trim(approval_reason)) > 0)", name="ck_standard_field_approval"
        ),
    )
    op.create_table(
        "standard_field_version_categories",
        sa.Column("standard_field_version_id", sa.BigInteger(), sa.ForeignKey("standard_field_versions.id", ondelete="RESTRICT"), primary_key=True),
        sa.Column("field_category_id", sa.BigInteger(), sa.ForeignKey("field_categories.id", ondelete="RESTRICT"), primary_key=True),
    )
    _create_bindings()
    _install_version_protection()


def _create_bindings():
    op.create_table(
        "standard_field_bindings",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("table_column_id", sa.BigInteger(), sa.ForeignKey("table_columns.id", ondelete="RESTRICT"), nullable=True),
        sa.Column("dataset_output_field_id", sa.BigInteger(), sa.ForeignKey("dataset_output_fields.id", ondelete="RESTRICT"), nullable=True),
        sa.Column("standard_field_version_id", sa.BigInteger(), sa.ForeignKey("standard_field_versions.id", ondelete="RESTRICT"), nullable=True),
        sa.Column("status", sa.String(16), server_default="unmapped", nullable=False),
        sa.Column("binding_version", sa.Integer(), server_default="0", nullable=False),
        sa.Column("observed_source_field_id", sa.String(128), nullable=True),
        sa.Column("observed_data_type", sa.String(16), nullable=True),
        sa.Column("created_by", sa.BigInteger(), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("confirmed_by", sa.BigInteger(), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=True),
        sa.Column("confirmed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("table_column_id", name="uq_standard_binding_table_column"),
        sa.UniqueConstraint("dataset_output_field_id", name="uq_standard_binding_output_field"),
        sa.CheckConstraint(
            "(table_column_id IS NOT NULL AND dataset_output_field_id IS NULL) "
            "OR (table_column_id IS NULL AND dataset_output_field_id IS NOT NULL)", name="ck_standard_binding_target"
        ),
        sa.CheckConstraint("binding_version >= 0", name="ck_standard_binding_version"),
        sa.CheckConstraint("status IN ('unmapped','suggested','confirmed','invalid')", name="ck_standard_binding_status"),
        sa.CheckConstraint(
            "(status='unmapped' AND standard_field_version_id IS NULL AND confirmed_by IS NULL AND confirmed_at IS NULL) "
            "OR (status='suggested' AND standard_field_version_id IS NOT NULL AND confirmed_by IS NULL AND confirmed_at IS NULL) "
            "OR (status='confirmed' AND standard_field_version_id IS NOT NULL AND binding_version > 0 "
            "AND confirmed_by IS NOT NULL AND confirmed_at IS NOT NULL AND observed_data_type IS NOT NULL "
            "AND length(trim(observed_data_type)) > 0) "
            "OR (status='invalid' AND ((confirmed_by IS NULL AND confirmed_at IS NULL) OR "
            "(standard_field_version_id IS NOT NULL AND binding_version > 0 AND confirmed_by IS NOT NULL AND confirmed_at IS NOT NULL)))",
            name="ck_standard_binding_confirmation"
        ),
    )


def _install_version_protection():
    op.execute("""
        CREATE FUNCTION protect_standard_field_code() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
            IF NEW.field_code IS DISTINCT FROM OLD.field_code AND EXISTS (
                SELECT 1 FROM standard_field_versions
                WHERE standard_field_id=OLD.id AND approved_by IS NOT NULL
            ) THEN
                RAISE EXCEPTION 'Published standard field code is immutable' USING ERRCODE='23514';
            END IF;
            RETURN NEW;
        END;
        $$
    """)
    op.execute("""
        CREATE TRIGGER protect_standard_field_code BEFORE UPDATE ON standard_fields
        FOR EACH ROW EXECUTE FUNCTION protect_standard_field_code()
    """)
    op.execute("""
        CREATE FUNCTION protect_standard_field_version() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
            IF TG_OP='INSERT' THEN
                PERFORM 1 FROM standard_fields WHERE id=NEW.standard_field_id FOR UPDATE;
                RETURN NEW;
            END IF;
            PERFORM 1 FROM standard_fields WHERE id=OLD.standard_field_id FOR UPDATE;
            IF TG_OP='DELETE' THEN
                IF OLD.approved_by IS NOT NULL THEN
                    RAISE EXCEPTION 'Approved standard field version cannot be deleted' USING ERRCODE='23514';
                END IF;
                RETURN OLD;
            END IF;
            IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
                (OLD.status='draft' AND NEW.status IN ('active','archived')) OR
                (OLD.status='active' AND NEW.status IN ('deprecated','archived')) OR
                (OLD.status='deprecated' AND NEW.status='archived')
            ) THEN
                RAISE EXCEPTION 'Standard field lifecycle cannot move backwards' USING ERRCODE='23514';
            END IF;
            IF OLD.approved_by IS NOT NULL AND (
                (to_jsonb(NEW) - ARRAY['status','updated_at','revision','status_reason','status_changed_by','status_changed_at']) IS DISTINCT FROM
                (to_jsonb(OLD) - ARRAY['status','updated_at','revision','status_reason','status_changed_by','status_changed_at'])
            ) THEN
                RAISE EXCEPTION 'Approved semantics require a new version' USING ERRCODE='23514';
            END IF;
            RETURN NEW;
        END;
        $$
    """)
    op.execute("""
        CREATE TRIGGER protect_standard_field_version BEFORE INSERT OR UPDATE OR DELETE ON standard_field_versions
        FOR EACH ROW EXECUTE FUNCTION protect_standard_field_version()
    """)
    op.execute("""
        CREATE FUNCTION protect_standard_field_categories() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
            IF TG_OP IN ('UPDATE','DELETE') THEN
                PERFORM 1 FROM standard_field_versions WHERE id=OLD.standard_field_version_id FOR UPDATE;
            END IF;
            IF TG_OP IN ('UPDATE','INSERT') THEN
                PERFORM 1 FROM standard_field_versions WHERE id=NEW.standard_field_version_id FOR UPDATE;
            END IF;
            IF TG_OP IN ('UPDATE','DELETE') AND EXISTS (
                SELECT 1 FROM standard_field_versions
                WHERE id=OLD.standard_field_version_id AND approved_by IS NOT NULL
            ) THEN
                RAISE EXCEPTION 'Approved categories require a new version' USING ERRCODE='23514';
            END IF;
            IF TG_OP IN ('UPDATE','INSERT') AND EXISTS (
                SELECT 1 FROM standard_field_versions
                WHERE id=NEW.standard_field_version_id AND approved_by IS NOT NULL
            ) THEN
                RAISE EXCEPTION 'Approved categories require a new version' USING ERRCODE='23514';
            END IF;
            IF TG_OP='DELETE' THEN RETURN OLD; END IF;
            RETURN NEW;
        END;
        $$
    """)
    op.execute("""
        CREATE TRIGGER protect_standard_field_categories BEFORE INSERT OR UPDATE OR DELETE
        ON standard_field_version_categories FOR EACH ROW EXECUTE FUNCTION protect_standard_field_categories()
    """)


def downgrade():
    op.execute("""
        DO $$ BEGIN
            IF EXISTS (SELECT 1 FROM standard_field_bindings LIMIT 1)
                OR EXISTS (SELECT 1 FROM standard_field_version_categories LIMIT 1)
                OR EXISTS (SELECT 1 FROM standard_field_versions LIMIT 1)
                OR EXISTS (SELECT 1 FROM standard_fields LIMIT 1) THEN
                RAISE EXCEPTION 'Standard catalog contains records; explicit preservation plan required before downgrade'
                    USING ERRCODE='23514';
            END IF;
        END $$
    """)
    op.drop_table("standard_field_bindings")
    op.drop_table("standard_field_version_categories")
    op.drop_table("standard_field_versions")
    op.drop_table("standard_fields")
    op.execute("DROP FUNCTION protect_standard_field_categories()")
    op.execute("DROP FUNCTION protect_standard_field_version()")
    op.execute("DROP FUNCTION protect_standard_field_code()")
