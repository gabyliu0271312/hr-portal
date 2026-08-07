"""Add materialized quality rule dependency index."""

from alembic import op
import sqlalchemy as sa


revision = "0195_quality_rule_dependency_index"
down_revision = "0194_quality_status_batch_sequence"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "warehouse_quality_rule_dependencies",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("rule_id", sa.BigInteger(), sa.ForeignKey("warehouse_quality_rules.id", ondelete="CASCADE"), nullable=False),
        sa.Column("table_name", sa.String(length=64), nullable=False),
        sa.Column("dataset_id", sa.BigInteger(), nullable=False),
        sa.Column("relation_id", sa.BigInteger(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.UniqueConstraint("rule_id", "table_name", name="uq_quality_rule_dependency_rule_table"),
    )
    op.create_index("ix_quality_rule_dependency_table", "warehouse_quality_rule_dependencies", ["table_name"])
    op.execute("""
        INSERT INTO warehouse_quality_rule_dependencies (rule_id, table_name, dataset_id, relation_id)
        SELECT rule.id, table_ref.table_name, relation.dataset_id, relation.id
        FROM warehouse_quality_rules AS rule
        JOIN dataset_relations AS relation
          ON relation.id = (rule.rule_config ->> 'relation_id')::bigint
        JOIN dataset_tables AS table_ref
          ON table_ref.dataset_id = relation.dataset_id
         AND table_ref.alias IN (relation.left_alias, relation.right_alias)
        WHERE rule.rule_type = 'relation_cardinality'
        ON CONFLICT (rule_id, table_name) DO NOTHING
    """)


def downgrade() -> None:
    op.drop_index("ix_quality_rule_dependency_table", table_name="warehouse_quality_rule_dependencies")
    op.drop_table("warehouse_quality_rule_dependencies")
