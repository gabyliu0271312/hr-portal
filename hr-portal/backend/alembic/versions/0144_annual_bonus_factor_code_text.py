"""store annual bonus factor codes as text

Revision ID: 0144
Revises: 0143
Create Date: 2026-07-28 15:00:00
"""

from alembic import op


revision = "0144"
down_revision = "0143"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        DO $$
        BEGIN
          IF to_regclass('public.ods_annual_bonus_estimate_factor') IS NOT NULL
             AND EXISTS (
               SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public'
                 AND table_name = 'ods_annual_bonus_estimate_factor'
                 AND column_name = 'factor_code'
             ) THEN
            ALTER TABLE ods_annual_bonus_estimate_factor
              ALTER COLUMN factor_code TYPE TEXT USING factor_code::text;
          END IF;
        END $$;
        """
    )
    op.execute(
        """
        UPDATE table_columns
        SET data_type = 'string'
        WHERE table_name = 'ods_annual_bonus_estimate_factor'
          AND column_code = 'factor_code'
        """
    )


def downgrade() -> None:
    pass
