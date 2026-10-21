"""Bind report execution versions without migrating legacy consumers."""
from alembic import op
import sqlalchemy as sa

revision = "0267_report_execution_binding"
down_revision = "0266_performance_progress_daily_rule"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("reports", sa.Column("execution_version", sa.String(32), nullable=False, server_default="legacy_v1"))
    op.add_column("reports", sa.Column("execution_binding", sa.JSON(), nullable=True))
    op.create_check_constraint("ck_report_execution_version", "reports", "execution_version IN ('legacy_v1','authorized_v1')")
    op.create_check_constraint("ck_report_execution_binding", "reports", "execution_version='legacy_v1' OR (execution_binding IS NOT NULL AND owner_id IS NOT NULL)")


def downgrade():
    if op.get_bind().execute(sa.text("SELECT EXISTS (SELECT 1 FROM reports WHERE execution_version <> 'legacy_v1')")).scalar():
        raise RuntimeError("Authorized reports must be safely retired before downgrade")
    op.drop_constraint("ck_report_execution_binding", "reports", type_="check")
    op.drop_constraint("ck_report_execution_version", "reports", type_="check")
    op.drop_column("reports", "execution_binding")
    op.drop_column("reports", "execution_version")
