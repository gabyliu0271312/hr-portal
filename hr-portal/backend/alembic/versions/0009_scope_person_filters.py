"""0009 scope tags: 组织范围 + 人员范围 两段式

- scope_tags 改字段：拆 is_unlimited 为 4 个开关，删除 sub_dimension
- 新建 scope_tag_filters：人员范围筛选条件（field_code/operator/values）
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0009_scope_person_filters"
down_revision: Union[str, None] = "0008_datasets"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1) scope_tags 字段调整（新增 4 个开关）
    op.add_column(
        "scope_tags",
        sa.Column(
            "org_scope_enabled",
            sa.Boolean,
            nullable=False,
            server_default=sa.text("true"),
        ),
    )
    op.add_column(
        "scope_tags",
        sa.Column(
            "org_scope_unlimited",
            sa.Boolean,
            nullable=False,
            server_default=sa.text("false"),
        ),
    )
    op.add_column(
        "scope_tags",
        sa.Column(
            "person_scope_enabled",
            sa.Boolean,
            nullable=False,
            server_default=sa.text("false"),
        ),
    )

    # 历史 is_unlimited=true → org_scope_unlimited=true（语义平移）
    op.execute(
        "UPDATE scope_tags SET org_scope_unlimited = true WHERE is_unlimited = true"
    )

    # 2) 新增 scope_tag_filters 表
    op.create_table(
        "scope_tag_filters",
        sa.Column("id", sa.BigInteger, primary_key=True),
        sa.Column(
            "tag_id",
            sa.BigInteger,
            sa.ForeignKey("scope_tags.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("field_code", sa.String(32), nullable=False),
        sa.Column("operator", sa.String(8), nullable=False),
        sa.Column(
            "values",
            sa.dialects.postgresql.JSONB,
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column("order_index", sa.Integer, nullable=False, server_default="0"),
        sa.CheckConstraint(
            "field_code IN ('employment_type','employment_entity','person')",
            name="ck_filter_field",
        ),
        sa.CheckConstraint(
            "operator IN ('eq','neq')",
            name="ck_filter_operator",
        ),
    )
    op.create_index("ix_scope_tag_filters_tag", "scope_tag_filters", ["tag_id"])

    # 3) 历史数据平移：sub_dimension in (employment_type/employment_entity) 的标签
    #    旧设计是用 selections.value_text 存值，新设计存到 scope_tag_filters
    #    当前库 0 条，但写完整保安全
    op.execute(
        """
        INSERT INTO scope_tag_filters (tag_id, field_code, operator, "values", order_index)
        SELECT t.id, t.sub_dimension, 'eq',
               jsonb_agg(s.value_text ORDER BY s.id),
               0
        FROM scope_tags t
        JOIN scope_tag_selections s ON s.tag_id = t.id
        WHERE t.dimension = 'org'
          AND t.sub_dimension IN ('employment_type','employment_entity')
          AND s.value_text IS NOT NULL
        GROUP BY t.id, t.sub_dimension
        """
    )
    # 这些标签转成「仅人员范围」标签
    op.execute(
        """
        UPDATE scope_tags
        SET org_scope_enabled = false, person_scope_enabled = true
        WHERE dimension = 'org' AND sub_dimension IN ('employment_type','employment_entity')
        """
    )
    # 删掉对应的 value_text 记录（保留 node_id 类型的）
    op.execute(
        """
        DELETE FROM scope_tag_selections
        WHERE value_text IS NOT NULL AND tag_id IN (
            SELECT id FROM scope_tags
            WHERE dimension = 'org' AND sub_dimension IN ('employment_type','employment_entity')
        )
        """
    )

    # 4) 删除旧字段 / 旧约束
    op.drop_constraint("ck_scope_tag_sub_dimension", "scope_tags", type_="check")
    op.drop_column("scope_tags", "sub_dimension")
    op.drop_column("scope_tags", "is_unlimited")


def downgrade() -> None:
    op.drop_index("ix_scope_tag_filters_tag", table_name="scope_tag_filters")
    op.drop_table("scope_tag_filters")

    op.add_column(
        "scope_tags",
        sa.Column("sub_dimension", sa.String(32), nullable=True),
    )
    op.add_column(
        "scope_tags",
        sa.Column(
            "is_unlimited",
            sa.Boolean,
            nullable=False,
            server_default=sa.text("false"),
        ),
    )
    op.create_check_constraint(
        "ck_scope_tag_sub_dimension",
        "scope_tags",
        "sub_dimension IS NULL OR sub_dimension IN "
        "('organization','employment_type','employment_entity')",
    )
    op.execute(
        "UPDATE scope_tags SET is_unlimited = true WHERE org_scope_unlimited = true"
    )

    op.drop_column("scope_tags", "person_scope_enabled")
    op.drop_column("scope_tags", "org_scope_unlimited")
    op.drop_column("scope_tags", "org_scope_enabled")
