"""track managed schemas used by push targets"""
from alembic import op

revision = "0161_push_target_schema_history"
down_revision = "0160_push_database_modes"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE push_targets ADD COLUMN IF NOT EXISTS schema_history JSON NOT NULL DEFAULT '[]'::json")
    op.execute(
        "UPDATE push_targets SET schema_history = json_build_array(settings->>'schema') "
        "WHERE settings->>'schema' IS NOT NULL AND settings->>'schema' <> '' "
        "AND schema_history = '[]'::json"
    )


def downgrade() -> None:
    op.execute("ALTER TABLE push_targets DROP COLUMN IF EXISTS schema_history")
