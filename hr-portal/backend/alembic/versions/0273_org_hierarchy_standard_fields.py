"""Seed system organization hierarchy standard fields."""
from alembic import op
import sqlalchemy as sa

revision = "0273_org_hierarchy_standard_fields"
down_revision = "0272_standard_field_display_name"
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    fields = [
        ("org_unit_id", "组织单元ID", "string", True),
        ("org_unit_name", "组织单元名称", "string", False),
        ("org_unit_parent_id", "上级组织单元ID", "string", False),
        ("org_unit_level", "组织层级", "number", False),
        ("org_unit_status", "组织单元状态", "string", False),
    ]
    for level in range(1, 11):
        fields.extend([
            (f"org_level_{level}_id", f"{level}级组织ID", "string", False),
            (f"org_level_{level}_name", f"{level}级组织名称", "string", False),
        ])
    for code, name, data_type, anchor in fields:
        bind.execute(sa.text("""
            INSERT INTO standard_fields (field_code, display_name, created_by)
            SELECT CAST(:code AS varchar(64)), CAST(:name AS varchar(128)), 1
            WHERE NOT EXISTS (SELECT 1 FROM standard_fields WHERE field_code = CAST(:code AS varchar(64)))
        """), {"code": code, "name": name})
        bind.execute(sa.text("""
            INSERT INTO standard_field_versions (
                standard_field_id, version, revision, field_name, business_definition,
                data_type, grain_level, permission_domain, is_permission_anchor,
                owner_user_id, value_domain, status, created_by, approved_by,
                approved_at, approval_reason
            )
            SELECT sf.id, 1, 0, CAST(:name AS varchar(128)), :definition, CAST(:data_type AS varchar(16)), 'coarse', 'org', :anchor,
                   1, NULL, 'active', 1, 1, now(), '系统组织层级标准字段初始化'
            FROM standard_fields sf
            WHERE sf.field_code = :code
              AND NOT EXISTS (
                  SELECT 1 FROM standard_field_versions sv
                  WHERE sv.standard_field_id = sf.id AND sv.version = 1
              )
        """), {
            "code": code,
            "name": name,
            "definition": f"系统组织层级语义字段：{name}",
            "data_type": data_type,
            "anchor": anchor,
        })


def downgrade():
    codes = ["org_unit_id", "org_unit_name", "org_unit_parent_id", "org_unit_level", "org_unit_status"]
    for level in range(1, 11):
        codes.extend([f"org_level_{level}_id", f"org_level_{level}_name"])
    bind = op.get_bind()
    bind.execute(sa.text("DELETE FROM standard_fields WHERE field_code = ANY(:codes)"), {"codes": codes})
