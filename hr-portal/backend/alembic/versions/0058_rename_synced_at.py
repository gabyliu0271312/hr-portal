"""0058 rename last_synced_at to synced_at

hr_pending_employee_full 表的 last_synced_at 字段需要改为 synced_at，
以匹配数据视图系统的 BASE_COLUMN_NAMES 约定（所有业务表必须含 id + synced_at），
否则数据视图页面会因 row.synced_at AttributeError 报 500。
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0058_rename_synced_at"
down_revision: Union[str, None] = "2d74c2f40380"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 重命名列 last_synced_at → synced_at
    op.alter_column(
        "hr_pending_employee_full",
        "last_synced_at",
        new_column_name="synced_at",
    )

    # 重命名索引
    op.drop_index("ix_pending_employee_last_synced", table_name="hr_pending_employee_full")
    op.create_index(
        "ix_pending_employee_synced",
        "hr_pending_employee_full",
        ["synced_at"],
    )

    # 更新 table_columns 元数据
    op.execute(
        sa.text(
            "UPDATE table_columns "
            "SET column_code = 'synced_at', column_label = '同步时间' "
            "WHERE table_name = 'hr_pending_employee_full' AND column_code = 'last_synced_at'"
        )
    )


def downgrade() -> None:
    # 反向操作：synced_at → last_synced_at
    op.execute(
        sa.text(
            "UPDATE table_columns "
            "SET column_code = 'last_synced_at', column_label = '最近同步时间' "
            "WHERE table_name = 'hr_pending_employee_full' AND column_code = 'synced_at'"
        )
    )

    op.drop_index("ix_pending_employee_synced", table_name="hr_pending_employee_full")
    op.create_index(
        "ix_pending_employee_last_synced",
        "hr_pending_employee_full",
        ["last_synced_at"],
    )

    op.alter_column(
        "hr_pending_employee_full",
        "synced_at",
        new_column_name="last_synced_at",
    )
