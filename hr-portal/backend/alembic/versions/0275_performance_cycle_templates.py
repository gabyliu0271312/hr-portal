"""Allow multiple configured templates per performance cycle."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0275_performance_cycle_templates"
down_revision = "0274_performance_calibration_task_phase"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("performance_cycles", sa.Column("template_ids", postgresql.JSONB(), nullable=False, server_default="[]"))
    op.execute("UPDATE performance_cycles SET template_ids = jsonb_build_array(template_id) WHERE template_id IS NOT NULL")


def downgrade():
    if op.get_bind().execute(sa.text("SELECT 1 FROM performance_cycles WHERE jsonb_array_length(template_ids) > 1 LIMIT 1")).first():
        raise RuntimeError("存在周期多模板配置，禁止降级丢失模板关联")
    op.execute("UPDATE performance_cycles SET template_id = (template_ids ->> 0)::bigint")
    op.drop_column("performance_cycles", "template_ids")
