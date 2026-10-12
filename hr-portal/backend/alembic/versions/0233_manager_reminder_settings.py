"""0233 add manager reminder settings"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "0233_manager_reminder_settings"
down_revision: Union[str, None] = "0232_performance_other_permission_settings"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_DEFAULT_NODE_TYPES = '["work_summary", "evaluation", "result_communication", "result_view"]'


def upgrade() -> None:
    op.add_column(
        "performance_other_permission_settings",
        sa.Column(
            "manager_reminder_enabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
    )
    op.add_column(
        "performance_other_permission_settings",
        sa.Column(
            "manager_reminder_node_types",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text(f"'{_DEFAULT_NODE_TYPES}'::jsonb"),
        ),
    )


def downgrade() -> None:
    op.drop_column("performance_other_permission_settings", "manager_reminder_node_types")
    op.drop_column("performance_other_permission_settings", "manager_reminder_enabled")
