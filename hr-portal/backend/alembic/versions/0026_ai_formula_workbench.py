"""0026 AI formula workbench"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0026_ai_formula_workbench"
down_revision: Union[str, None] = "0025_document_generation_logs"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "dataset_calculated_fields",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("dataset_id", sa.BigInteger(), nullable=False),
        sa.Column("code", sa.String(64), nullable=False),
        sa.Column("label", sa.String(128), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("formula", sa.Text(), nullable=False),
        sa.Column("formula_display", sa.Text(), nullable=True),
        sa.Column("data_type", sa.String(16), nullable=False, server_default="number"),
        sa.Column("agg_role", sa.String(16), nullable=False, server_default="measure"),
        sa.Column("depends_on", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("used_functions", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("is_sensitive", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_by", sa.BigInteger(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["dataset_id"], ["datasets.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], ondelete="SET NULL"),
        sa.UniqueConstraint("dataset_id", "code", name="uq_dataset_calc_field_code"),
    )
    op.create_index(
        "ix_dataset_calc_fields_dataset",
        "dataset_calculated_fields",
        ["dataset_id", "is_active"],
    )

    op.create_table(
        "formula_functions",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("code", sa.String(64), nullable=False),
        sa.Column("name", sa.String(128), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("function_type", sa.String(32), nullable=False, server_default="expression"),
        sa.Column("parameters", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("return_type", sa.String(16), nullable=False, server_default="number"),
        sa.Column("formula_body", sa.Text(), nullable=True),
        sa.Column("is_enabled", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("is_sensitive_output", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("created_by", sa.BigInteger(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], ondelete="SET NULL"),
        sa.UniqueConstraint("code", name="uq_formula_functions_code"),
    )
    op.create_index(
        "ix_formula_functions_type_enabled",
        "formula_functions",
        ["function_type", "is_enabled"],
    )
    op.bulk_insert(
        sa.table(
            "formula_functions",
            sa.column("code", sa.String),
            sa.column("name", sa.String),
            sa.column("description", sa.Text),
            sa.column("function_type", sa.String),
            sa.column("parameters", sa.JSON),
            sa.column("return_type", sa.String),
            sa.column("formula_body", sa.Text),
            sa.column("is_enabled", sa.Boolean),
            sa.column("is_sensitive_output", sa.Boolean),
        ),
        [
            {
                "code": "CALC_TAX",
                "name": "个税试算",
                "description": "按内置个税速算逻辑根据输入金额试算个人所得税。",
                "function_type": "system_builtin",
                "parameters": [{"name": "amount", "type": "number", "description": "税前金额"}],
                "return_type": "number",
                "formula_body": None,
                "is_enabled": True,
                "is_sensitive_output": True,
            },
            {
                "code": "SAFE_DIVIDE",
                "name": "安全除法",
                "description": "除数为 0 或空时返回默认值。",
                "function_type": "system_builtin",
                "parameters": [
                    {"name": "a", "type": "number"},
                    {"name": "b", "type": "number"},
                    {"name": "default", "type": "number"},
                ],
                "return_type": "number",
                "formula_body": None,
                "is_enabled": True,
                "is_sensitive_output": False,
            },
        ],
    )

    op.create_table(
        "ai_provider_configs",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("provider", sa.String(32), nullable=False, server_default="openai_compatible"),
        sa.Column("name", sa.String(128), nullable=False),
        sa.Column("base_url", sa.String(255), nullable=True),
        sa.Column("api_key_encrypted", sa.Text(), nullable=True),
        sa.Column("model_fast_json", sa.String(128), nullable=True),
        sa.Column("model_reasoning", sa.String(128), nullable=True),
        sa.Column("timeout_seconds", sa.BigInteger(), nullable=False, server_default="30"),
        sa.Column("is_enabled", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("extra_config", sa.JSON(), nullable=False, server_default="{}"),
        sa.Column("created_by", sa.BigInteger(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], ondelete="SET NULL"),
        sa.UniqueConstraint("provider", name="uq_ai_provider_configs_provider"),
    )
    op.create_index("ix_ai_provider_configs_enabled", "ai_provider_configs", ["is_enabled"])

    op.create_table(
        "system_logs",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("category", sa.String(64), nullable=False),
        sa.Column("action", sa.String(64), nullable=False),
        sa.Column("status", sa.String(32), nullable=False, server_default="success"),
        sa.Column("user_id", sa.BigInteger(), nullable=True),
        sa.Column("request_summary", sa.Text(), nullable=True),
        sa.Column("response_summary", sa.Text(), nullable=True),
        sa.Column("input_hash", sa.String(64), nullable=True),
        sa.Column("output_hash", sa.String(64), nullable=True),
        sa.Column("metadata_json", sa.JSON(), nullable=False, server_default="{}"),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("token_usage", sa.JSON(), nullable=True),
        sa.Column("trace_id", sa.String(64), nullable=True),
        sa.Column("latency_ms", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_system_logs_category_created", "system_logs", ["category", "created_at"])
    op.create_index("ix_system_logs_user_created", "system_logs", ["user_id", "created_at"])


def downgrade() -> None:
    op.drop_index("ix_system_logs_user_created", table_name="system_logs")
    op.drop_index("ix_system_logs_category_created", table_name="system_logs")
    op.drop_table("system_logs")
    op.drop_index("ix_ai_provider_configs_enabled", table_name="ai_provider_configs")
    op.drop_table("ai_provider_configs")
    op.drop_index("ix_formula_functions_type_enabled", table_name="formula_functions")
    op.drop_table("formula_functions")
    op.drop_index("ix_dataset_calc_fields_dataset", table_name="dataset_calculated_fields")
    op.drop_table("dataset_calculated_fields")
