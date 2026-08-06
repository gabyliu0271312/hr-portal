"""Add enum default metadata for table columns."""

import json

from alembic import op
import sqlalchemy as sa


revision = "0180_enum_default"
down_revision = "0179_dwd_id_identity"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("table_columns", sa.Column("enum_default", sa.String(length=255), nullable=True))
    op.execute(
        sa.text(
            """
            UPDATE table_columns
            SET enum_options = CAST(:options AS json), enum_default = :default_value
            WHERE table_name = 'cost_center_monthly'
              AND column_code = 'status'
              AND data_type = 'enum'
            """
        ).bindparams(options=json.dumps(["\u542f\u7528", "\u505c\u7528"], ensure_ascii=False), default_value="\u542f\u7528")
    )


def downgrade() -> None:
    op.drop_column("table_columns", "enum_default")
