"""fix employee monthly allocation business identity

Revision ID: 0145
Revises: 0144
Create Date: 2026-07-29 10:15:00
"""

import hashlib

from alembic import op
import sqlalchemy as sa


revision = "0145"
down_revision = "0144"
branch_labels = None
depends_on = None


_TABLE_NAME = "emp_monthly_allocation"
_KEY_COLUMNS = ("cost_period", "employee_no", "code")
_REQUIRED_COLUMNS = (*_KEY_COLUMNS, "dimension_value")


def _require_schema(bind) -> None:
    table_exists = bind.execute(
        sa.text("SELECT to_regclass('public.emp_monthly_allocation') IS NOT NULL")
    ).scalar()
    if not table_exists:
        raise RuntimeError(f"缺少业务表: {_TABLE_NAME}")

    physical_columns = set(
        bind.execute(
            sa.text(
                "SELECT column_name FROM information_schema.columns "
                "WHERE table_schema = 'public' AND table_name = :table_name"
            ),
            {"table_name": _TABLE_NAME},
        ).scalars()
    )
    metadata_columns = set(
        bind.execute(
            sa.text(
                "SELECT column_code FROM table_columns WHERE table_name = :table_name"
            ),
            {"table_name": _TABLE_NAME},
        ).scalars()
    )
    missing_physical = sorted(set(_REQUIRED_COLUMNS) - physical_columns)
    missing_metadata = sorted(set(_REQUIRED_COLUMNS) - metadata_columns)
    if missing_physical or missing_metadata:
        raise RuntimeError(
            "员工月度成本分摊表元数据不完整: "
            f"缺少物理列={missing_physical}, 缺少字段元数据={missing_metadata}"
        )


def _require_clean_business_keys(bind) -> None:
    null_or_blank = bind.execute(
        sa.text(
            "SELECT cost_period, employee_no, code "
            'FROM "emp_monthly_allocation" '
            "WHERE cost_period IS NULL OR BTRIM(cost_period::text) = '' "
            "OR employee_no IS NULL OR BTRIM(employee_no::text) = '' "
            "OR code IS NULL OR BTRIM(code::text) = '' "
            "LIMIT 10"
        )
    ).all()
    if null_or_blank:
        raise RuntimeError(
            "员工月度成本分摊表存在空业务主键，无法切换主键口径: "
            f"{null_or_blank}"
        )

    duplicates = bind.execute(
        sa.text(
            'SELECT cost_period, employee_no, code, COUNT(*) AS row_count '
            'FROM "emp_monthly_allocation" '
            "GROUP BY cost_period, employee_no, code HAVING COUNT(*) > 1 "
            "LIMIT 10"
        )
    ).all()
    if duplicates:
        raise RuntimeError(
            "员工月度成本分摊表按新业务主键存在重复记录，"
            "请先处理后再迁移: "
            f"{duplicates}"
        )


def _rebuild_pk_hash(bind) -> None:
    rows = bind.execute(
        sa.text(
            'SELECT id, cost_period, employee_no, code FROM "emp_monthly_allocation"'
        )
    ).mappings()
    for row in rows:
        material = "||".join(str(row[column]) for column in _KEY_COLUMNS)
        pk_hash = hashlib.sha256(material.encode("utf-8")).hexdigest()[:32]
        bind.execute(
            sa.text(
                'UPDATE "emp_monthly_allocation" SET pk_hash = :pk_hash WHERE id = :id'
            ),
            {"id": row["id"], "pk_hash": pk_hash},
        )


def upgrade() -> None:
    bind = op.get_bind()
    _require_schema(bind)
    _require_clean_business_keys(bind)

    bind.execute(
        sa.text(
            'ALTER TABLE "emp_monthly_allocation" '
            'ALTER COLUMN "employee_no" TYPE TEXT USING "employee_no"::text'
        )
    )
    bind.execute(
        sa.text(
            "UPDATE table_columns "
            "SET is_pk_part = CASE "
            "WHEN column_code IN ('cost_period', 'employee_no', 'code') THEN true "
            "WHEN column_code = 'dimension_value' THEN false "
            "ELSE is_pk_part END, "
            "data_type = CASE WHEN column_code = 'employee_no' THEN 'string' ELSE data_type END, "
            "display_order = CASE "
            "WHEN column_code = 'cost_period' THEN 0 "
            "WHEN column_code = 'employee_no' THEN 10 "
            "WHEN column_code = 'code' THEN 20 "
            "ELSE display_order END "
            "WHERE table_name = :table_name "
            "AND column_code IN ('cost_period', 'employee_no', 'code', 'dimension_value')"
        ),
        {"table_name": _TABLE_NAME},
    )
    _rebuild_pk_hash(bind)


def downgrade() -> None:
    # 新旧业务主键语义无法从现有数据无损反推，禁止自动回滚。
    pass
