"""Add scope_strategy to registered tables, reports and datasets."""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0042_scope_strategy"
down_revision: Union[str, None] = "0041_table_tools_merge"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

VALID = ("person_first", "cc_first", "cross_filter")


def _check(nullable: bool) -> str:
    values = ", ".join(f"'{v}'" for v in VALID)
    null_part = " OR scope_strategy IS NULL" if nullable else ""
    return f"scope_strategy IN ({values}){null_part}"


def upgrade() -> None:
    op.add_column(
        "registered_tables",
        sa.Column(
            "scope_strategy",
            sa.String(length=32),
            nullable=False,
            server_default="cross_filter",
        ),
    )
    op.add_column("reports", sa.Column("scope_strategy", sa.String(length=32), nullable=True))
    op.add_column("datasets", sa.Column("scope_strategy", sa.String(length=32), nullable=True))
    op.create_check_constraint(
        "ck_registered_tables_scope_strategy",
        "registered_tables",
        _check(nullable=False),
    )
    op.create_check_constraint(
        "ck_reports_scope_strategy",
        "reports",
        _check(nullable=True),
    )
    op.create_check_constraint(
        "ck_datasets_scope_strategy",
        "datasets",
        _check(nullable=True),
    )

    bind = op.get_bind()
    defaults = {
        "emp_realtime_roster": "person_first",
        "emp_monthly_roster": "person_first",
        "emp_monthly_salary": "person_first",
        "emp_monthly_allocation": "cc_first",
        "cost_center_monthly": "cc_first",
        "emp_monthly_cost_class": "cc_first",
        "emp_monthly_cost_result": "cc_first",
    }
    for table, strategy in defaults.items():
        bind.execute(
            sa.text(
                """
                UPDATE registered_tables
                SET scope_strategy = :strategy
                WHERE table_name = :table
                """
            ),
            {"table": table, "strategy": strategy},
        )
    bind.execute(
        sa.text(
            """
            UPDATE table_columns
            SET scope_role = 'cc_code'
            WHERE table_name = 'emp_monthly_allocation'
              AND column_code = 'code'
              AND scope_role IS NULL
            """
        )
    )


def downgrade() -> None:
    op.drop_constraint("ck_datasets_scope_strategy", "datasets", type_="check")
    op.drop_constraint("ck_reports_scope_strategy", "reports", type_="check")
    op.drop_constraint(
        "ck_registered_tables_scope_strategy", "registered_tables", type_="check"
    )
    op.drop_column("datasets", "scope_strategy")
    op.drop_column("reports", "scope_strategy")
    op.drop_column("registered_tables", "scope_strategy")
