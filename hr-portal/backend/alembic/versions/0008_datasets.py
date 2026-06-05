"""0008 datasets + reports.dataset_id

新增 datasets / dataset_tables / dataset_relations / dataset_acl
给 reports 加 dataset_id 字段（可选，单表模式仍可用 table_name；数据集模式优先 dataset_id）
新增 report_acl
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0008_datasets"
down_revision: Union[str, None] = "0007_scopes"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # datasets
    op.create_table(
        "datasets",
        sa.Column("id", sa.BigInteger, primary_key=True),
        sa.Column("name", sa.String(64), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.text("true")),
        sa.Column(
            "created_by",
            sa.BigInteger,
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.UniqueConstraint("name", name="uq_dataset_name"),
    )

    op.create_table(
        "dataset_tables",
        sa.Column("id", sa.BigInteger, primary_key=True),
        sa.Column(
            "dataset_id",
            sa.BigInteger,
            sa.ForeignKey("datasets.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("table_name", sa.String(64), nullable=False),
        sa.Column("alias", sa.String(64), nullable=False),
        sa.UniqueConstraint("dataset_id", "alias", name="uq_dataset_table_alias"),
    )
    op.create_index("ix_dataset_table_ds", "dataset_tables", ["dataset_id"])

    op.create_table(
        "dataset_relations",
        sa.Column("id", sa.BigInteger, primary_key=True),
        sa.Column(
            "dataset_id",
            sa.BigInteger,
            sa.ForeignKey("datasets.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("left_alias", sa.String(64), nullable=False),
        sa.Column("right_alias", sa.String(64), nullable=False),
        sa.Column("join_type", sa.String(8), nullable=False, server_default="left"),
        sa.Column("keys", sa.JSON, nullable=False, server_default=sa.text("'[]'::json")),
    )
    op.create_index("ix_dataset_rel_ds", "dataset_relations", ["dataset_id"])

    op.create_table(
        "dataset_acl",
        sa.Column("id", sa.BigInteger, primary_key=True),
        sa.Column(
            "dataset_id",
            sa.BigInteger,
            sa.ForeignKey("datasets.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "role_id",
            sa.BigInteger,
            sa.ForeignKey("roles.id", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.Column(
            "user_id",
            sa.BigInteger,
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=True,
        ),
    )
    op.create_index("ix_dataset_acl_ds", "dataset_acl", ["dataset_id"])

    # reports 加 dataset_id
    op.add_column(
        "reports",
        sa.Column(
            "dataset_id",
            sa.BigInteger,
            sa.ForeignKey("datasets.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index("ix_reports_dataset", "reports", ["dataset_id"])

    # report_acl
    op.create_table(
        "report_acl",
        sa.Column("id", sa.BigInteger, primary_key=True),
        sa.Column(
            "report_id",
            sa.BigInteger,
            sa.ForeignKey("reports.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "role_id",
            sa.BigInteger,
            sa.ForeignKey("roles.id", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.Column(
            "user_id",
            sa.BigInteger,
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=True,
        ),
    )
    op.create_index("ix_report_acl_report", "report_acl", ["report_id"])


def downgrade() -> None:
    op.drop_index("ix_report_acl_report", table_name="report_acl")
    op.drop_table("report_acl")
    op.drop_index("ix_reports_dataset", table_name="reports")
    op.drop_column("reports", "dataset_id")
    op.drop_index("ix_dataset_acl_ds", table_name="dataset_acl")
    op.drop_table("dataset_acl")
    op.drop_index("ix_dataset_rel_ds", table_name="dataset_relations")
    op.drop_table("dataset_relations")
    op.drop_index("ix_dataset_table_ds", table_name="dataset_tables")
    op.drop_table("dataset_tables")
    op.drop_table("datasets")
