"""0235 add HRBP-scoped other permission settings"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "0235_other_permission_hrbp_scope"
down_revision: Union[str, None] = "0234_merge_performance_settings_and_hrbp"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    columns = {column["name"] for column in sa.inspect(op.get_bind()).get_columns("performance_other_permission_settings")}
    if "hrbp_permissions" not in columns:
        op.add_column(
            "performance_other_permission_settings",
            sa.Column(
                "hrbp_permissions",
                postgresql.JSONB(astext_type=sa.Text()),
                nullable=False,
                server_default=sa.text("'[]'::jsonb"),
            ),
        )


def downgrade() -> None:
    columns = {column["name"] for column in sa.inspect(op.get_bind()).get_columns("performance_other_permission_settings")}
    if "hrbp_permissions" in columns:
        op.drop_column("performance_other_permission_settings", "hrbp_permissions")
