"""Persist assessment method settings."""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0243_performance_assessment_method_settings"
down_revision: Union[str, None] = "0242_performance_role_function_keys"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "performance_assessment_method_settings",
        sa.Column("id", sa.BigInteger(), nullable=False),
        sa.Column("metric_assessment_enabled", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("updated_by_type", sa.String(length=32), nullable=True),
        sa.Column("updated_by_ref", sa.String(length=64), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    op.drop_table("performance_assessment_method_settings")
