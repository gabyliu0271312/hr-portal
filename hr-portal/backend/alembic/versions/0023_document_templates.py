"""0023 document templates"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0023_document_templates"
down_revision: Union[str, None] = "0022_push_targets"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "document_templates",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("code", sa.String(64), nullable=False),
        sa.Column("name", sa.String(128), nullable=False),
        sa.Column("business_type", sa.String(64), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("version", sa.String(32), nullable=False, server_default="1.0"),
        sa.Column("effective_start", sa.Date(), nullable=True),
        sa.Column("effective_end", sa.Date(), nullable=True),
        sa.Column("layout_config", sa.JSON(), nullable=False, server_default="{}"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("code", name="uq_document_templates_code"),
    )
    op.create_index(
        "ix_document_templates_business_type",
        "document_templates",
        ["business_type"],
    )

    op.create_table(
        "document_template_blocks",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column(
            "template_id",
            sa.BigInteger(),
            sa.ForeignKey("document_templates.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("block_type", sa.String(32), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("display_order", sa.Integer(), nullable=False, server_default="10"),
        sa.Column("style_config", sa.JSON(), nullable=False, server_default="{}"),
    )
    op.create_index(
        "ix_document_template_blocks_template_order",
        "document_template_blocks",
        ["template_id", "display_order"],
    )

    op.create_table(
        "document_template_variables",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column(
            "template_id",
            sa.BigInteger(),
            sa.ForeignKey("document_templates.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("variable_code", sa.String(64), nullable=False),
        sa.Column("variable_name", sa.String(128), nullable=False),
        sa.Column("source_type", sa.String(32), nullable=False, server_default="manual"),
        sa.Column("source_key", sa.String(128), nullable=True),
        sa.Column("default_value", sa.Text(), nullable=True),
        sa.Column("required", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("formatter", sa.String(32), nullable=True),
        sa.UniqueConstraint("template_id", "variable_code", name="uq_document_template_variable_code"),
    )
    op.create_index(
        "ix_document_template_variables_template",
        "document_template_variables",
        ["template_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_document_template_variables_template", table_name="document_template_variables")
    op.drop_table("document_template_variables")
    op.drop_index("ix_document_template_blocks_template_order", table_name="document_template_blocks")
    op.drop_table("document_template_blocks")
    op.drop_index("ix_document_templates_business_type", table_name="document_templates")
    op.drop_table("document_templates")
