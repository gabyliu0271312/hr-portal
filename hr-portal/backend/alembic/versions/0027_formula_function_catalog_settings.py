"""0027 formula function catalog settings"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0027_formula_catalog"
down_revision: Union[str, None] = "0026_ai_formula_workbench"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "formula_function_catalog_settings",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("code", sa.String(96), nullable=False),
        sa.Column("is_visible", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("is_enabled", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("is_ai_enabled", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("created_by", sa.BigInteger(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], ondelete="SET NULL"),
        sa.UniqueConstraint("code", name="uq_formula_function_catalog_settings_code"),
    )
    op.create_index(
        "ix_formula_function_catalog_settings_enabled",
        "formula_function_catalog_settings",
        ["is_enabled", "is_visible"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_formula_function_catalog_settings_enabled",
        table_name="formula_function_catalog_settings",
    )
    op.drop_table("formula_function_catalog_settings")
