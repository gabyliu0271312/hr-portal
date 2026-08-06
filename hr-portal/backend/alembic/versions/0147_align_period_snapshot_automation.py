"""align monthly allocation automation policy safely

Revision ID: 0147
Revises: 0146
"""
from alembic import op
import sqlalchemy as sa

revision = "0180_align_period_snapshot_automation"
down_revision = "0179_dwd_id_identity"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    table = "emp_monthly_allocation"
    exists = bind.execute(sa.text("SELECT to_regclass('public.emp_monthly_allocation') IS NOT NULL")).scalar()
    if not exists:
        return
    missing = bind.execute(sa.text(
        "SELECT column_code FROM table_columns "
        "WHERE table_name = :t AND column_code IN ('cost_period','employee_no','code') "
        "GROUP BY column_code HAVING bool_or(is_pk_part) IS NOT TRUE"
    ), {"t": table}).all()
    if missing:
        raise RuntimeError(f"员工月度成本分摊表业务主键元数据不完整: {missing}")
    invalid = bind.execute(sa.text(
        'SELECT cost_period, employee_no, code FROM "emp_monthly_allocation" '
        "WHERE cost_period IS NULL OR BTRIM(cost_period::text) = '' "
        "OR employee_no IS NULL OR BTRIM(employee_no::text) = '' "
        "OR code IS NULL OR BTRIM(code::text) = '' LIMIT 10"
    )).all()
    if invalid:
        raise RuntimeError(f"员工月度成本分摊表存在空业务主键: {invalid}")
    duplicates = bind.execute(sa.text(
        'SELECT cost_period, employee_no, code, COUNT(*) FROM "emp_monthly_allocation" '
        "GROUP BY cost_period, employee_no, code HAVING COUNT(*) > 1 LIMIT 10"
    )).all()
    if duplicates:
        raise RuntimeError(f"员工月度成本分摊表存在重复业务主键: {duplicates}")
    bind.execute(sa.text(
        "UPDATE ods_dwd_automation_configs SET "
        "business_key_fields = '[\"cost_period\",\"employee_no\",\"code\"]'::json, "
        "ods_sync_semantics = 'full_snapshot', "
        "dwd_write_strategy = 'incremental_upsert', "
        "missing_row_strategy = 'hard_delete' "
        "WHERE ods_table_name = :t"
    ), {"t": table})


def downgrade() -> None:
    pass
