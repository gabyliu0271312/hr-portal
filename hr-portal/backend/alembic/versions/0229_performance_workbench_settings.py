"""0229 performance workbench settings"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0229_performance_workbench_settings"
down_revision: Union[str, None] = "0228_performance_tag_fill_questions"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "performance_workbench_settings",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("announcement_enabled", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("updated_by_type", sa.String(length=32), nullable=True),
        sa.Column("updated_by_ref", sa.String(length=64), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_table(
        "performance_workbench_entries",
        sa.Column("id", sa.BigInteger(), sa.Identity(), primary_key=True),
        sa.Column("title", sa.String(length=128), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False, server_default=sa.text("'active'")),
        sa.Column("link", sa.String(length=2048), nullable=False),
        sa.Column("icon", sa.String(length=128), nullable=True),
        sa.Column("visibility", sa.String(length=128), nullable=False, server_default=sa.text("'所有人'")),
        sa.Column("display_order", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("created_by_type", sa.String(length=32), nullable=True),
        sa.Column("created_by_ref", sa.String(length=64), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.CheckConstraint("status IN ('active', 'inactive')", name="ck_performance_workbench_entry_status"),
    )
    op.create_index(
        "ix_performance_workbench_entries_status_order",
        "performance_workbench_entries",
        ["status", "display_order", "id"],
    )
    op.create_table(
        "performance_workbench_announcements",
        sa.Column("id", sa.BigInteger(), sa.Identity(), primary_key=True),
        sa.Column("title", sa.String(length=128), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False, server_default=sa.text("'active'")),
        sa.Column("link", sa.String(length=2048), nullable=False),
        sa.Column("cycle_label", sa.String(length=128), nullable=False, server_default=sa.text("'所有周期'")),
        sa.Column("visibility", sa.String(length=128), nullable=False, server_default=sa.text("'所有人'")),
        sa.Column("display_order", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("created_by_type", sa.String(length=32), nullable=True),
        sa.Column("created_by_ref", sa.String(length=64), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.CheckConstraint("status IN ('active', 'inactive')", name="ck_performance_workbench_announcement_status"),
    )
    op.create_index(
        "ix_performance_workbench_announcements_status_order",
        "performance_workbench_announcements",
        ["status", "display_order", "id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_performance_workbench_announcements_status_order",
        table_name="performance_workbench_announcements",
    )
    op.drop_table("performance_workbench_announcements")
    op.drop_index(
        "ix_performance_workbench_entries_status_order",
        table_name="performance_workbench_entries",
    )
    op.drop_table("performance_workbench_entries")
    op.drop_table("performance_workbench_settings")
