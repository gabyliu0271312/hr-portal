from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0327_member_filter_presets"
down_revision = "0326_performance_manager_standard"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "performance_member_filter_presets",
        sa.Column("id", sa.BigInteger().with_variant(sa.Integer(), "sqlite"), sa.Identity(), primary_key=True),
        sa.Column("owner_type", sa.String(32), nullable=False),
        sa.Column("owner_ref", sa.String(64), nullable=False),
        sa.Column("cycle_id", sa.BigInteger(), sa.ForeignKey("performance_cycles.id", ondelete="CASCADE"), nullable=False),
        sa.Column("management_role", sa.String(32), nullable=False),
        sa.Column("name", sa.String(500), nullable=False),
        sa.Column("filters", sa.JSON().with_variant(postgresql.JSONB(), "postgresql"), nullable=False),
        sa.UniqueConstraint("owner_type", "owner_ref", "cycle_id", "management_role", "name", name="uq_pm_member_filter_preset_scope_name"),
        sa.CheckConstraint("length(trim(name)) BETWEEN 1 AND 500", name="ck_pm_member_filter_preset_name"),
        sa.CheckConstraint("management_role IN ('', 'hrbp', 'project_admin')", name="ck_pm_member_filter_preset_role"),
    )


def downgrade():
    op.drop_table("performance_member_filter_presets")
