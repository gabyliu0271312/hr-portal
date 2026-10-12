"""Persist performance metric field definitions."""
from alembic import op
import sqlalchemy as sa

revision = "0248_performance_metric_fields"
down_revision = "0247_performance_template_score_method"
branch_labels = None
depends_on = None


def upgrade():
    fields = op.create_table(
        "performance_metric_fields",
        sa.Column("id", sa.BigInteger(), sa.Identity(start=9), primary_key=True),
        sa.Column("name", sa.String(128), nullable=False),
        sa.Column("field_type", sa.String(16), nullable=False),
        sa.Column("is_system", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_by_type", sa.String(32), nullable=False),
        sa.Column("created_by_ref", sa.String(64), nullable=False),
        sa.Column("updated_by", sa.String(128), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("name", name="uq_performance_metric_fields_name"),
        sa.CheckConstraint("field_type IN ('text', 'number', 'percentage', 'person')", name="ck_performance_metric_field_type"),
        sa.CheckConstraint("field_type != 'person' OR is_system", name="ck_performance_metric_field_person_system"),
        sa.CheckConstraint("length(btrim(name)) > 0", name="ck_performance_metric_field_name"),
    )
    op.bulk_insert(fields, [
        {"id": field_id, "name": name, "field_type": field_type, "is_system": True,
         "created_by_type": "SYSTEM", "created_by_ref": "bootstrap", "updated_by": ""}
        for field_id, name, field_type in [
            (1, "指标", "text"), (2, "权重", "percentage"), (3, "指标单位", "text"),
            (4, "目标值", "number"), (5, "完成值", "number"),
            (7, "完成说明", "text"), (8, "指标评价人", "person"),
        ]
    ])


def downgrade():
    op.drop_table("performance_metric_fields")
