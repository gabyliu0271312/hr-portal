"""Persist immutable, database-validated warehouse conversion evidence."""
from alembic import op
import sqlalchemy as sa

revision = "0268_warehouse_conversion_evidence"
down_revision = "0267_report_execution_binding"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "warehouse_conversion_runs",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("source_table", sa.String(64), nullable=False),
        sa.Column("target_table", sa.String(64), nullable=False),
        sa.Column("evidence", sa.JSON(), nullable=False),
        sa.Column("lineage_id", sa.BigInteger(), sa.ForeignKey("warehouse_lineage_edges.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("lineage_id", name="uq_warehouse_conversion_run_lineage"),
        sa.CheckConstraint(
            "source_table ~ '^[a-z_][a-z0-9_]*$' AND target_table ~ '^[a-z_][a-z0-9_]*$' AND source_table <> target_table",
            name="ck_conversion_run_table_identifiers",
        ),
        sa.CheckConstraint(
            "(evidence::jsonb) ? 'version' AND (evidence::jsonb) ? 'status' AND "
            "jsonb_typeof(evidence::jsonb) = 'object' AND "
            "jsonb_typeof(evidence::jsonb -> 'version') = 'number' AND evidence->>'version' = '1' AND "
            "jsonb_typeof(evidence::jsonb -> 'status') = 'string' AND evidence->>'status' = 'success'",
            name="ck_conversion_run_success_evidence",
        ),
    )
    op.create_index("ix_warehouse_conversion_runs_target_table", "warehouse_conversion_runs", ["target_table"])

    op.create_table(
        "warehouse_conversion_approvals",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("dataset_id", sa.BigInteger(), sa.ForeignKey("datasets.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("contract_id", sa.BigInteger(), sa.ForeignKey("data_product_authorization_contracts.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("run_id", sa.BigInteger(), sa.ForeignKey("warehouse_conversion_runs.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("dataset_version", sa.Integer(), nullable=False),
        sa.Column("model_fingerprint", sa.String(64), nullable=False),
        sa.Column("approved_by", sa.BigInteger(), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("dataset_id", "contract_id", "run_id", "dataset_version", "model_fingerprint", name="uq_conversion_approval_identity"),
        sa.CheckConstraint("dataset_version > 0", name="ck_conversion_approval_dataset_version"),
        sa.CheckConstraint("model_fingerprint ~ '^[0-9a-fA-F]{64}$'", name="ck_conversion_approval_model_fingerprint"),
        sa.CheckConstraint("length(trim(reason)) > 0", name="ck_conversion_approval_reason"),
    )
    for name, table, columns in (
        ("ix_warehouse_conversion_approvals_dataset_id", "warehouse_conversion_approvals", ["dataset_id"]),
        ("ix_warehouse_conversion_approvals_contract_id", "warehouse_conversion_approvals", ["contract_id"]),
        ("ix_warehouse_conversion_approvals_run_id", "warehouse_conversion_approvals", ["run_id"]),
    ):
        op.create_index(name, table, columns)

    op.execute("""
        CREATE FUNCTION validate_warehouse_conversion_run() RETURNS trigger
        LANGUAGE plpgsql AS $$
        DECLARE lineage warehouse_lineage_edges%ROWTYPE;
        BEGIN
            SELECT * INTO lineage FROM warehouse_lineage_edges WHERE id = NEW.lineage_id FOR UPDATE;
            IF NOT FOUND OR lineage.operation <> 'standardize' OR lineage.source_asset <> NEW.source_table OR lineage.target_asset <> NEW.target_table
               OR (lineage.run_id IS NOT NULL AND lineage.run_id <> NEW.id) THEN
                RAISE EXCEPTION 'Conversion run lineage does not match source, target, and standardize operation' USING ERRCODE='23514';
            END IF;
            RETURN NEW;
        END;
        $$
    """)
    op.execute("CREATE TRIGGER validate_warehouse_conversion_run BEFORE INSERT ON warehouse_conversion_runs FOR EACH ROW EXECUTE FUNCTION validate_warehouse_conversion_run()")
    op.execute("""
        CREATE FUNCTION protect_warehouse_conversion_run() RETURNS trigger
        LANGUAGE plpgsql AS $$
        BEGIN RAISE EXCEPTION 'Warehouse conversion runs are append-only' USING ERRCODE='23514'; END;
        $$
    """)
    op.execute("CREATE TRIGGER protect_warehouse_conversion_run BEFORE UPDATE OR DELETE ON warehouse_conversion_runs FOR EACH ROW EXECUTE FUNCTION protect_warehouse_conversion_run()")
    op.execute("""
        CREATE FUNCTION validate_warehouse_conversion_approval() RETURNS trigger
        LANGUAGE plpgsql AS $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM datasets d JOIN data_product_authorization_contracts c ON c.dataset_id = d.id
                WHERE d.id = NEW.dataset_id AND d.is_active IS TRUE AND d.version = NEW.dataset_version
                  AND c.id = NEW.contract_id AND c.status = 'active'
            ) THEN
                RAISE EXCEPTION 'Conversion approval requires an active contract for the active dataset version' USING ERRCODE='23514';
            END IF;
            RETURN NEW;
        END;
        $$
    """)
    op.execute("CREATE TRIGGER validate_warehouse_conversion_approval BEFORE INSERT ON warehouse_conversion_approvals FOR EACH ROW EXECUTE FUNCTION validate_warehouse_conversion_approval()")
    op.execute("""
        CREATE FUNCTION protect_warehouse_conversion_approval() RETURNS trigger
        LANGUAGE plpgsql AS $$
        BEGIN RAISE EXCEPTION 'Warehouse conversion approvals are append-only' USING ERRCODE='23514'; END;
        $$
    """)
    op.execute("CREATE TRIGGER protect_warehouse_conversion_approval BEFORE UPDATE OR DELETE ON warehouse_conversion_approvals FOR EACH ROW EXECUTE FUNCTION protect_warehouse_conversion_approval()")
    op.execute("""
        CREATE FUNCTION protect_conversion_lineage_reference() RETURNS trigger
        LANGUAGE plpgsql AS $$
        BEGIN
            IF TG_OP = 'DELETE' AND EXISTS (SELECT 1 FROM warehouse_conversion_runs WHERE lineage_id = OLD.id) THEN
                RAISE EXCEPTION 'Lineage referenced by a conversion run cannot be deleted' USING ERRCODE='23514';
            END IF;
            IF TG_OP = 'UPDATE' AND EXISTS (SELECT 1 FROM warehouse_conversion_runs WHERE lineage_id = OLD.id) THEN
                IF NEW.source_asset IS DISTINCT FROM OLD.source_asset OR NEW.target_asset IS DISTINCT FROM OLD.target_asset
                   OR NEW.operation IS DISTINCT FROM OLD.operation OR NEW.operator IS DISTINCT FROM OLD.operator
                   OR NEW.edge_metadata::jsonb IS DISTINCT FROM OLD.edge_metadata::jsonb OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
                    RAISE EXCEPTION 'Referenced lineage is immutable except for its first run association' USING ERRCODE='23514';
                END IF;
                IF OLD.run_id IS NOT NULL AND NEW.run_id IS DISTINCT FROM OLD.run_id THEN
                    RAISE EXCEPTION 'Referenced lineage run_id is immutable once associated' USING ERRCODE='23514';
                END IF;
                IF OLD.run_id IS NULL AND NEW.run_id IS NOT NULL AND NOT EXISTS (
                    SELECT 1 FROM warehouse_conversion_runs WHERE id = NEW.run_id AND lineage_id = OLD.id
                ) THEN
                    RAISE EXCEPTION 'Lineage run_id must reference its conversion run' USING ERRCODE='23514';
                END IF;
            END IF;
            IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
            RETURN NEW;
        END;
        $$
    """)
    op.execute("CREATE TRIGGER protect_conversion_lineage_reference BEFORE UPDATE OR DELETE ON warehouse_lineage_edges FOR EACH ROW EXECUTE FUNCTION protect_conversion_lineage_reference()")


def downgrade():
    op.execute("""
        DO $$ BEGIN
            IF EXISTS (SELECT 1 FROM warehouse_conversion_approvals LIMIT 1) OR EXISTS (SELECT 1 FROM warehouse_conversion_runs LIMIT 1) THEN
                RAISE EXCEPTION 'Conversion evidence must be empty before downgrade' USING ERRCODE='23514';
            END IF;
        END $$
    """)
    op.execute("DROP TRIGGER protect_conversion_lineage_reference ON warehouse_lineage_edges")
    op.execute("DROP TRIGGER protect_warehouse_conversion_approval ON warehouse_conversion_approvals")
    op.execute("DROP TRIGGER validate_warehouse_conversion_approval ON warehouse_conversion_approvals")
    op.execute("DROP TRIGGER protect_warehouse_conversion_run ON warehouse_conversion_runs")
    op.execute("DROP TRIGGER validate_warehouse_conversion_run ON warehouse_conversion_runs")
    for name in ("ix_warehouse_conversion_approvals_run_id", "ix_warehouse_conversion_approvals_contract_id", "ix_warehouse_conversion_approvals_dataset_id"):
        op.drop_index(name, table_name="warehouse_conversion_approvals")
    op.drop_table("warehouse_conversion_approvals")
    op.drop_index("ix_warehouse_conversion_runs_target_table", table_name="warehouse_conversion_runs")
    op.drop_table("warehouse_conversion_runs")
    for name in ("protect_conversion_lineage_reference", "protect_warehouse_conversion_approval", "validate_warehouse_conversion_approval", "protect_warehouse_conversion_run", "validate_warehouse_conversion_run"):
        op.execute(f"DROP FUNCTION {name}()")
