"""Reconcile performance snapshot columns omitted from retired migration branches."""
from alembic import op
import sqlalchemy as sa


revision = "0227_reconcile_performance_snapshot_columns"
down_revision = "0226_merge_performance_and_dwd_heads"
branch_labels = None
depends_on = None


def _columns() -> set[str]:
    return {
        column["name"]
        for column in sa.inspect(op.get_bind()).get_columns(
            "performance_authorization_snapshot_people"
        )
    }


def upgrade() -> None:
    if not sa.inspect(op.get_bind()).has_table("performance_authorization_snapshot_people"):
        return

    columns = _columns()
    if "is_manually_maintained" not in columns:
        op.add_column(
            "performance_authorization_snapshot_people",
            sa.Column(
                "is_manually_maintained",
                sa.Boolean(),
                nullable=False,
                server_default=sa.false(),
            ),
        )
        op.alter_column(
            "performance_authorization_snapshot_people",
            "is_manually_maintained",
            server_default=None,
        )
    if "departure_date" not in columns:
        op.add_column(
            "performance_authorization_snapshot_people",
            sa.Column("departure_date", sa.Date(), nullable=True),
        )


def downgrade() -> None:
    if not sa.inspect(op.get_bind()).has_table("performance_authorization_snapshot_people"):
        return

    columns = _columns()
    if "departure_date" in columns:
        op.drop_column("performance_authorization_snapshot_people", "departure_date")
    if "is_manually_maintained" in columns:
        op.drop_column("performance_authorization_snapshot_people", "is_manually_maintained")
