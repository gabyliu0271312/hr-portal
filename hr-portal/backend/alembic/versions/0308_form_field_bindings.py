"""字段与表单分离：form_field_bindings + Person 标准字段 + 归属修正

背景（2026-11-17 用户三个挑战）：
1. 工号/姓名应归属 Person 主数据，不是分摊结果分组
2. 成本中心编码/名称应归属成本中心，不是分摊结果分组
3. 标准字段（全局唯一语义）与表单（页面展示哪些字段）必须分离：
   - 标准字段归实体（Person / 成本中心 / 分摊结果）
   - form_field_bindings 决定每个表单（form_key）展示哪些字段、顺序
   - 表单加/删字段 ≠ 删除标准字段

0306 曾把 7 个字段全塞进「分摊结果」分组，本迁移修正归属并建立表单绑定。
取值来源由数据连接（UCP 同步 → standard_field_bindings）配置，未配置时空态展示。
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "0308_form_field_bindings"
down_revision = "0307_performance_comparison"
branch_labels = None
depends_on = None

# form_field_bindings 表
def _create_form_field_bindings() -> None:
    op.create_table(
        "form_field_bindings",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("form_key", sa.String(64), nullable=False),
        sa.Column("standard_field_id", sa.BigInteger(), sa.ForeignKey("standard_fields.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("display_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("form_key", "standard_field_id", name="uq_form_field_binding"),
    )
    op.create_index("ix_form_field_bindings_form_key", "form_field_bindings", ["form_key"])


# Person 实体（幂等创建，owner 取 user id 1 与 0273 一致）
def _ensure_person_entity(conn) -> int:
    row = conn.execute(
        sa.text("SELECT id FROM master_entity_definitions WHERE entity_code = 'person'")
    ).fetchone()
    if row:
        return row[0]
    conn.execute(
        sa.text("INSERT INTO master_entity_definitions (entity_code, name, description, owner_user_id) "
                "VALUES ('person', '人员', '人员主数据实体（Person）', 1) RETURNING id")
    )
    return conn.execute(
        sa.text("SELECT id FROM master_entity_definitions WHERE entity_code = 'person'")
    ).fetchone()[0]


def _ensure_group(conn, name: str, order: int) -> int:
    row = conn.execute(sa.text("SELECT id FROM field_groups WHERE name = :n"), {"n": name}).fetchone()
    if row:
        return row[0]
    conn.execute(sa.text("INSERT INTO field_groups (name, display_order, is_active) VALUES (:n, :o, true)"),
                 {"n": name, "o": order})
    return conn.execute(sa.text("SELECT id FROM field_groups WHERE name = :n"), {"n": name}).fetchone()[0]


def _ensure_standard_field(conn, field_code: str, name: str, data_type: str, order: int,
                           definition: str, entity_id: int | None, group_id: int | None) -> int:
    row = conn.execute(
        sa.text("SELECT id FROM standard_fields WHERE field_code = :c"), {"c": field_code}
    ).fetchone()
    if row:
        fid = row[0]
        # 修正归属（幂等：目标不一致才更新）
        if entity_id is not None or group_id is not None:
            conn.execute(
                sa.text("UPDATE standard_fields SET entity_id = COALESCE(:e, entity_id), "
                        "group_id = COALESCE(:g, group_id), display_order = :o WHERE id = :id"),
                {"e": entity_id, "g": group_id, "o": order, "id": fid},
            )
        return fid
    conn.execute(
        sa.text("INSERT INTO standard_fields (field_code, display_name, data_type, display_order, "
                "business_definition, entity_id, group_id, is_active, created_by) "
                "VALUES (:c, :n, :t, :o, :d, :e, :g, true, 1)"),
        {"c": field_code, "n": name, "t": data_type, "o": order,
         "d": definition, "e": entity_id, "g": group_id},
    )
    return conn.execute(
        sa.text("SELECT id FROM standard_fields WHERE field_code = :c"), {"c": field_code}
    ).fetchone()[0]


def _ensure_binding(conn, form_key: str, field_id: int, order: int) -> None:
    exists = conn.execute(
        sa.text("SELECT id FROM form_field_bindings WHERE form_key = :k AND standard_field_id = :f"),
        {"k": form_key, "f": field_id},
    ).fetchone()
    if not exists:
        conn.execute(
            sa.text("INSERT INTO form_field_bindings (form_key, standard_field_id, display_order) "
                    "VALUES (:k, :f, :o)"),
            {"k": form_key, "f": field_id, "o": order},
        )


def upgrade() -> None:
    _create_form_field_bindings()
    conn = op.get_bind()

    person_entity_id = _ensure_person_entity(conn)

    # 分组（幂等）
    work_group = _ensure_group(conn, "工作信息", 1)
    personal_group = _ensure_group(conn, "个人信息", 2)
    bank_group = _ensure_group(conn, "银行卡信息", 3)
    id_group = _ensure_group(conn, "证件信息", 4)
    cc_group = _ensure_group(conn, "成本中心", 20)
    alloc_group = _ensure_group(conn, "分摊结果", 70)

    # ── Person 标准字段（一次性创建，归 Person 实体 + 对应分组）──
    person_fields = [
        # (field_code, 显示名, 类型, 顺序, 业务定义, 分组)
        ("employee_no", "工号", "string", 10, "员工工号（业务标识，标准 string）", work_group),
        ("full_name", "姓名", "string", 20, "员工姓名", personal_group),
        ("chinese_name", "中文名", "string", 30, "员工中文名", personal_group),
        ("english_name", "英文名", "string", 40, "员工英文名", personal_group),
        ("work_location", "工作地", "enum", 50, "员工工作地（enum）", work_group),
        ("id_type", "证件类型", "string", 60, "证件类型", id_group),
        ("id_number", "证件号码", "string", 70, "证件号码", id_group),
        ("birth_date", "出生日期", "date", 80, "出生日期", personal_group),
        ("gender", "性别", "string", 90, "性别", personal_group),
        ("highest_education", "最高学历", "string", 100, "最高学历", personal_group),
        ("highest_edu_graduation_date", "最高学历毕业时间", "date", 110, "最高学历毕业时间", personal_group),
        ("corporate_email", "企业邮箱", "string", 120, "企业邮箱", personal_group),
        ("mobile_phone", "手机号", "string", 130, "手机号", personal_group),
        ("bank_card_number", "银行卡号", "string", 140, "银行卡号", bank_group),
        ("bank_branch", "开户支行", "string", 150, "开户支行", bank_group),
    ]
    person_field_ids = {}
    for code, name, dtype, order, definition, group_id in person_fields:
        person_field_ids[code] = _ensure_standard_field(
            conn, code, name, dtype, order, definition, person_entity_id, group_id
        )

    # ── 成本中心标准字段（归成本中心分组，暂不建实体）──
    cc_code_id = _ensure_standard_field(
        conn, "cost_center_code", "成本中心编码", "string", 10,
        "成本中心编码（以成本中心树为准）", None, cc_group,
    )
    cc_name_id = _ensure_standard_field(
        conn, "cost_center_name", "成本中心名称", "string", 20,
        "成本中心名称（以成本中心树为准）", None, cc_group,
    )

    # ── 分摊结果标准字段（归分摊结果分组）──
    alloc_fields = {}
    for code, name, dtype, order, definition in [
        ("cost_period", "月份", "string", 10, "分摊结果的期间月份"),
        ("allocation_percentage", "分摊比例", "number", 60, "员工在该成本中心的分摊比例"),
        ("synced_at", "更新时间", "datetime", 70, "分摊结果同步落库时间"),
    ]:
        alloc_fields[code] = _ensure_standard_field(
            conn, code, name, dtype, order, definition, None, alloc_group
        )

    # ── 表单初始绑定 ──
    # 人员信息表单（form_key=people_roster）：Person 字段
    for order, code in enumerate(["employee_no", "full_name", "chinese_name", "english_name",
                                   "work_location", "id_type", "id_number", "birth_date",
                                   "gender", "highest_education", "highest_edu_graduation_date",
                                   "corporate_email", "mobile_phone", "bank_card_number", "bank_branch"]):
        _ensure_binding(conn, "people_roster", person_field_ids[code], order)

    # 分摊结果表单（form_key=allocation_result）：分摊结果字段 + 工号/姓名/成本中心编码/名称
    alloc_bindings = [
        ("cost_period", alloc_fields["cost_period"]),
        ("employee_no", person_field_ids["employee_no"]),
        ("full_name", person_field_ids["full_name"]),
        ("cost_center_code", cc_code_id),
        ("cost_center_name", cc_name_id),
        ("allocation_percentage", alloc_fields["allocation_percentage"]),
        ("synced_at", alloc_fields["synced_at"]),
    ]
    for order, (_, fid) in enumerate(alloc_bindings):
        _ensure_binding(conn, "allocation_result", fid, order)


def downgrade() -> None:
    op.drop_table("form_field_bindings")
