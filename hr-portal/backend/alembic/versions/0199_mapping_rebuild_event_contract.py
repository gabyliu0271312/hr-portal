"""Mapping rebuild UCP 幂等事件合同。"""
from alembic import op
import sqlalchemy as sa

revision = "0199_mapping_rebuild_event_contract"
down_revision = "0198_cost_center_mapping_lifecycle"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("mapping_rebuild_runs", sa.Column("event_id", sa.String(128), nullable=False, server_default=""))
    op.add_column("mapping_rebuild_runs", sa.Column("mapping_version", sa.Integer, nullable=False, server_default="0"))
    op.execute(
        "UPDATE mapping_rebuild_runs SET event_id = 'legacy-rebuild-' || id::text "
        "WHERE event_id = ''"
    )
    op.execute(
        "UPDATE mapping_rebuild_runs SET mapping_version = 0 "
        "WHERE mapping_version IS NULL"
    )
    op.create_unique_constraint(
        "uq_mapping_rebuild_idempotency",
        "mapping_rebuild_runs",
        ["event_id", "binding_id", "mapping_version", "target_id"],
    )
    op.create_index("ix_mapping_rebuild_event", "mapping_rebuild_runs", ["event_id"])


def downgrade() -> None:
    op.drop_index("ix_mapping_rebuild_event", table_name="mapping_rebuild_runs")
    op.drop_constraint("uq_mapping_rebuild_idempotency", "mapping_rebuild_runs", type_="unique")
    op.drop_column("mapping_rebuild_runs", "mapping_version")
    op.drop_column("mapping_rebuild_runs", "event_id")
