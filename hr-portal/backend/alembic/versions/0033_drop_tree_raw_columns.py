"""Drop retired JSON columns from source and tree tables."""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0033_drop_tree_raw_columns"
down_revision: Union[str, None] = "0032_source_field_id"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


TABLES = (
    "emp_realtime_roster",
    "emp_monthly_roster",
    "emp_monthly_salary",
    "emp_monthly_allocation",
    "cost_center_monthly",
    "emp_monthly_cost_class",
    "emp_monthly_cost_result",
    "emp_severance_installment",
    "emp_year_end_bonus",
    "cost_center_tree",
    "org_tree",
)


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    for table_name in TABLES:
        if not inspector.has_table(table_name):
            continue
        columns = {col["name"] for col in inspector.get_columns(table_name)}
        if "raw" in columns:
            op.drop_column(table_name, "raw")


def downgrade() -> None:
    # The retired JSON-column structure is not restored.
    pass
