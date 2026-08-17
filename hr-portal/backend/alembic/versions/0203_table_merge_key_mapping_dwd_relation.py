"""Add table merge key mappings and DWD relations."""
from alembic import op
import sqlalchemy as sa

revision = "0203_table_merge_key_mapping_dwd_relation"
down_revision = "0202_performance_cycle_period_subtype"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "merge_key_mappings",
        sa.Column("id", sa.BigInteger(), nullable=False),
        sa.Column("template_id", sa.BigInteger(), nullable=False),
        sa.Column("source_mapping_id", sa.BigInteger(), nullable=True),
        sa.Column("source_key", sa.JSON(), nullable=False),
        sa.Column("canonical_merge_key", sa.JSON(), nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_by", sa.BigInteger(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["template_id"], ["merge_templates.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["source_mapping_id"], ["merge_source_mappings.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_merge_key_mapping_context", "merge_key_mappings", ["template_id", "source_mapping_id"])

    op.create_table(
        "merge_dwd_relations",
        sa.Column("id", sa.BigInteger(), nullable=False),
        sa.Column("template_id", sa.BigInteger(), nullable=False),
        sa.Column("name", sa.String(length=128), nullable=False),
        sa.Column("report_id", sa.BigInteger(), nullable=False),
        sa.Column("left_fields", sa.JSON(), nullable=False),
        sa.Column("right_fields", sa.JSON(), nullable=False),
        sa.Column("select_fields", sa.JSON(), nullable=False),
        sa.Column("missing_policy", sa.String(length=16), nullable=False, server_default="anomaly"),
        sa.Column("multiple_policy", sa.String(length=16), nullable=False, server_default="anomaly"),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_by", sa.BigInteger(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["template_id"], ["merge_templates.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["report_id"], ["reports.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("template_id", "name", name="uq_merge_dwd_relation_name"),
    )
    op.create_index("ix_merge_dwd_relation_template", "merge_dwd_relations", ["template_id"])


def downgrade() -> None:
    op.drop_index("ix_merge_dwd_relation_template", table_name="merge_dwd_relations")
    op.drop_table("merge_dwd_relations")
    op.drop_index("ix_merge_key_mapping_context", table_name="merge_key_mappings")
    op.drop_table("merge_key_mappings")
