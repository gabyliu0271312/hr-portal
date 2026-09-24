"""Persist cycle-scoped HRBP permissions and invisible people."""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "0233_performance_hrbp_permissions"
down_revision: Union[str, None] = "0232_performance_other_permission_settings"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "performance_hrbp_permissions",
        sa.Column("id", sa.BigInteger(), sa.Identity(), primary_key=True),
        sa.Column(
            "cycle_ref",
            sa.String(length=64),
            sa.ForeignKey("performance_cycles.cycle_ref", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("hrbp_employee_no", sa.String(length=64), nullable=False),
        sa.Column("scope", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("invisible_people", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("created_by_type", sa.String(length=32), nullable=True),
        sa.Column("created_by_ref", sa.String(length=64), nullable=True),
        sa.Column("updated_by_type", sa.String(length=32), nullable=True),
        sa.Column("updated_by_ref", sa.String(length=64), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.UniqueConstraint("cycle_ref", "hrbp_employee_no", name="uq_performance_hrbp_permission_cycle_hrbp"),
    )
    op.create_index("ix_performance_hrbp_permissions_cycle", "performance_hrbp_permissions", ["cycle_ref"])


def downgrade() -> None:
    op.drop_index("ix_performance_hrbp_permissions_cycle", table_name="performance_hrbp_permissions")
    op.drop_table("performance_hrbp_permissions")
