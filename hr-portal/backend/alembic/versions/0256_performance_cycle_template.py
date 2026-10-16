"""Persist the selected performance template on cycles."""
from alembic import op
import sqlalchemy as sa

revision = "0256_performance_cycle_template"
down_revision = "0255_product_auth_contract"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "performance_cycles",
        sa.Column("template_id", sa.BigInteger(), nullable=True),
    )
    op.create_foreign_key(
        "fk_performance_cycles_template_id",
        "performance_cycles",
        "performance_templates",
        ["template_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        "ix_performance_cycles_template_id",
        "performance_cycles",
        ["template_id"],
    )


def downgrade():
    op.drop_index("ix_performance_cycles_template_id", table_name="performance_cycles")
    op.drop_constraint(
        "fk_performance_cycles_template_id",
        "performance_cycles",
        type_="foreignkey",
    )
    op.drop_column("performance_cycles", "template_id")
