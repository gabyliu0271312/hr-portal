"""Authorization contract metadata; not an executable permission switch."""
from alembic import op
import sqlalchemy as sa

revision = "0255_product_auth_contract"
down_revision = "0254_standard_field_catalog"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "data_product_authorization_contracts",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("dataset_id", sa.BigInteger(), sa.ForeignKey("datasets.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("contract_version", sa.Integer(), server_default="1", nullable=False),
        sa.Column("revision", sa.Integer(), server_default="0", nullable=False),
        sa.Column("status", sa.String(16), server_default="draft", nullable=False),
        sa.Column("contract_json", sa.JSON(), nullable=False),
        sa.Column("model_snapshot", sa.JSON(), nullable=False),
        sa.Column("approved_by", sa.BigInteger(), sa.ForeignKey("users.id", ondelete="RESTRICT")),
        sa.Column("approved_at", sa.DateTime(timezone=True)),
        sa.Column("approval_reason", sa.Text()),
        sa.Column("created_by", sa.BigInteger(), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("dataset_id", "contract_version", name="uq_data_product_contract_version"),
        sa.CheckConstraint("contract_version > 0 AND revision >= 0", name="ck_data_product_contract_numbers"),
        sa.CheckConstraint("status IN ('draft','active','retired')", name="ck_data_product_contract_status"),
        sa.CheckConstraint(
            "(status='draft' AND approved_by IS NULL AND approved_at IS NULL AND approval_reason IS NULL) OR "
            "(status IN ('active','retired') AND approved_by IS NOT NULL AND approved_at IS NOT NULL "
            "AND approval_reason IS NOT NULL AND length(trim(approval_reason))>0)",
            name="ck_data_product_contract_approval",
        ),
    )
    op.create_index("ix_data_product_contract_status", "data_product_authorization_contracts", ["status"])
    op.execute("""
        CREATE FUNCTION protect_product_auth_contract() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
            IF TG_OP='DELETE' THEN
                IF OLD.approved_by IS NOT NULL THEN
                    RAISE EXCEPTION 'Approved product contract cannot be deleted' USING ERRCODE='23514';
                END IF;
                RETURN OLD;
            END IF;
            IF OLD.approved_by IS NOT NULL AND (
                (to_jsonb(NEW) - ARRAY['status','revision','updated_at','approved_by','approved_at','approval_reason']) IS DISTINCT FROM
                (to_jsonb(OLD) - ARRAY['status','revision','updated_at','approved_by','approved_at','approval_reason'])
            ) THEN
                RAISE EXCEPTION 'Approved contract requires a new version' USING ERRCODE='23514';
            END IF;
            IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
                (OLD.status='draft' AND NEW.status='active') OR
                (OLD.status='active' AND NEW.status='retired')
            ) THEN
                RAISE EXCEPTION 'Invalid contract transition' USING ERRCODE='23514';
            END IF;
            RETURN NEW;
        END; $$
    """)
    op.execute("""
        CREATE TRIGGER protect_product_auth_contract BEFORE UPDATE OR DELETE
        ON data_product_authorization_contracts FOR EACH ROW EXECUTE FUNCTION protect_product_auth_contract()
    """)


def downgrade():
    op.execute("""
        DO $$ BEGIN
            IF EXISTS (SELECT 1 FROM data_product_authorization_contracts LIMIT 1) THEN
                RAISE EXCEPTION 'Product contracts require explicit preservation before downgrade' USING ERRCODE='23514';
            END IF;
        END $$
    """)
    op.drop_index("ix_data_product_contract_status", table_name="data_product_authorization_contracts")
    op.drop_table("data_product_authorization_contracts")
    op.execute("DROP FUNCTION protect_product_auth_contract()")
