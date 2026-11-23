"""Add role-union announcements, private images and per-cycle acknowledgement."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0323_pm_workbench_announcements"
down_revision = "0322_pm_calibration_completion"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "performance_announcement_images",
        sa.Column("id", sa.BigInteger(), sa.Identity(), primary_key=True),
        sa.Column("content", sa.LargeBinary(), nullable=False),
        sa.Column("content_type", sa.String(32), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("octet_length(content) BETWEEN 1 AND 10485760", name="ck_performance_announcement_image_size"),
        sa.CheckConstraint("content_type IN ('image/png', 'image/jpeg')", name="ck_performance_announcement_image_type"),
    )
    table = "performance_workbench_announcements"
    op.add_column(table, sa.Column("visibility_roles", postgresql.JSONB(), nullable=False, server_default="[]"))
    op.execute("""UPDATE performance_workbench_announcements
        SET visibility_roles = CASE WHEN visibility_role IN ('HRBP', 'REAL_LINE_MANAGER')
            THEN jsonb_build_array(visibility_role) ELSE '[]'::jsonb END,
            visibility = CASE WHEN visibility = '指定人员' THEN '指定角色' ELSE visibility END""")
    op.drop_column(table, "visibility_role")
    for name, length in (("title_en", 128), ("link_en", 2048), ("description", 1000), ("description_en", 1000)):
        op.add_column(table, sa.Column(name, sa.String(length), nullable=False, server_default=""))
    for name in ("image_id", "image_en_id"):
        op.add_column(table, sa.Column(name, sa.BigInteger(), nullable=True))
        op.create_foreign_key(f"fk_workbench_announcement_{name}", table, "performance_announcement_images", [name], ["id"], ondelete="RESTRICT")
    op.create_table(
        "performance_announcement_acknowledgements",
        sa.Column("id", sa.BigInteger(), sa.Identity(), primary_key=True),
        sa.Column("announcement_id", sa.BigInteger(), sa.ForeignKey(f"{table}.id", ondelete="CASCADE"), nullable=False),
        sa.Column("employee_no", sa.String(64), nullable=False),
        sa.Column("cycle_ref", sa.String(64), sa.ForeignKey("performance_cycles.cycle_ref", ondelete="RESTRICT"), nullable=False),
        sa.Column("acknowledged_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("announcement_id", "employee_no", "cycle_ref", name="uq_performance_announcement_ack"),
    )


def downgrade():
    if op.get_bind().execute(sa.text("""SELECT
        EXISTS (SELECT 1 FROM performance_announcement_acknowledgements)
        OR EXISTS (SELECT 1 FROM performance_announcement_images)
        OR EXISTS (SELECT 1 FROM performance_workbench_announcements
            WHERE jsonb_array_length(visibility_roles) > 1
                OR title_en <> '' OR link_en <> '' OR description <> '' OR description_en <> '')
    """)).scalar():
        raise RuntimeError("ANNOUNCEMENT_DOWNGRADE_WOULD_LOSE_DATA")
    table = "performance_workbench_announcements"
    op.drop_table("performance_announcement_acknowledgements")
    op.add_column(table, sa.Column("visibility_role", sa.String(32), nullable=True))
    op.execute("""UPDATE performance_workbench_announcements
        SET visibility_role = visibility_roles ->> 0,
            visibility = CASE WHEN visibility = '指定角色' THEN '指定人员' ELSE visibility END""")
    for name in ("image_id", "image_en_id"):
        op.drop_constraint(f"fk_workbench_announcement_{name}", table, type_="foreignkey")
        op.drop_column(table, name)
    for name in ("description_en", "description", "link_en", "title_en", "visibility_roles"):
        op.drop_column(table, name)
    op.drop_table("performance_announcement_images")
