"""Store identity numbers as text in ODS and DWD roster tables."""
from alembic import op
import sqlalchemy as sa


revision = "0208_identity_number_text"
down_revision = "0207_merge_dwd_relation_dataset"
branch_labels = None
depends_on = None


_TABLES = ("emp_realtime_roster", "dwd_emp_realtime_roster")


def upgrade() -> None:
    bind = op.get_bind()

    for table_name in _TABLES:
        bind.execute(
            sa.text(
                f"""
                DO $$
                BEGIN
                    IF EXISTS (
                        SELECT 1
                        FROM information_schema.columns
                        WHERE table_schema = 'public'
                          AND table_name = '{table_name}'
                          AND column_name = 'id_number'
                    ) THEN
                        ALTER TABLE {table_name}
                        ALTER COLUMN id_number TYPE TEXT
                        USING id_number::text;
                    END IF;
                END $$;
                """
            )
        )

        bind.execute(
            sa.text(
                """
                UPDATE table_columns
                SET data_type = 'string',
                    agg_role = 'dimension'
                WHERE table_name = :table_name
                  AND column_code = 'id_number'
                """
            ),
            {"table_name": table_name},
        )


def downgrade() -> None:
    # 证件号码可能包含 X 或前导零，不能安全恢复为 NUMERIC。
    pass
