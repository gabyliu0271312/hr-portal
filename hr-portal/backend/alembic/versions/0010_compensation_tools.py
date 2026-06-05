"""0010 compensation tools

- compensation_caps: 地区补偿金基数上限配置
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0010_compensation_tools"
down_revision: Union[str, None] = "0009_scope_person_filters"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "compensation_caps",
        sa.Column("id", sa.BigInteger, primary_key=True),
        sa.Column("region", sa.String(64), nullable=False),
        sa.Column("effective_start", sa.Date, nullable=False),
        sa.Column("effective_end", sa.Date, nullable=False),
        sa.Column("cap_amount", sa.Numeric(14, 2), nullable=False),
        sa.Column("note", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.UniqueConstraint("region", "effective_start", "effective_end", name="uq_comp_cap_period"),
    )
    op.create_index(
        "ix_comp_caps_region_period",
        "compensation_caps",
        ["region", "effective_start", "effective_end"],
    )


def downgrade() -> None:
    op.drop_index("ix_comp_caps_region_period", table_name="compensation_caps")
    op.drop_table("compensation_caps")
