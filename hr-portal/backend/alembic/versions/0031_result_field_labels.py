"""0031 result field labels"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0031_result_field_labels"
down_revision: Union[str, None] = "0030_dataset_only"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    label_pairs = {
        "salary_bonus": "应发工资（含奖金）",
        "field": "本月实发",
        "field_2": "第二期发放",
        "field_3": "第三期发放",
        "field_4": "第四期发放",
    }
    for code, label in label_pairs.items():
        conn.execute(
            sa.text(
                """
                UPDATE table_columns
                SET column_label = :label
                WHERE table_name = 'emp_monthly_cost_result'
                  AND column_code = :code
                  AND column_label = column_code
                """
            ),
            {"code": code, "label": label},
        )


def downgrade() -> None:
    pass
