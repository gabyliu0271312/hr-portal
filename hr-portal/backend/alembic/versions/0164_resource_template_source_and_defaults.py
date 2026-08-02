"""Track resource template sources and initialize template defaults."""
from __future__ import annotations

import json

from alembic import op
import sqlalchemy as sa

revision = "0164_resource_template_source_and_defaults"
down_revision = "0163_align_cost_allocation_webhook_resource"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("ucp_resource", sa.Column("source_template_id", sa.BigInteger(), nullable=True))
    op.create_foreign_key("fk_ucp_resource_source_template", "ucp_resource", "ucp_connector_package", ["source_template_id"], ["id"], ondelete="SET NULL")
    op.add_column("ucp_resource", sa.Column("source_template_code", sa.String(length=64), nullable=True))
    op.create_index("ix_ucp_resource_source_template", "ucp_resource", ["system_id", "source_template_id"])
    bind = op.get_bind()
    bind.execute(
        sa.text(
            "UPDATE ucp_resource SET source_template_code = :template_code "
            "WHERE resource_code = :resource_code AND source_template_code IS NULL"
        ),
        {"template_code": "COST_ALLOCATION_LOCKED_INGRESS", "resource_code": "cost-allocation-locked"},
    )
    bind.execute(sa.text("UPDATE ucp_resource SET source_template_id = (SELECT id FROM ucp_connector_package WHERE package_code = :template_code) WHERE source_template_code = :template_code"), {"template_code": "COST_ALLOCATION_LOCKED_INGRESS"})
    schema = {
        "parent_package_code": "COST_ALLOCATION_SYSTEM",
        "resource_connector_type": "webhook_ingress",
        "resource_defaults": {
            "resource_code": "cost-allocation-locked",
            "resource_name": "成本分摊系统 Webhook",
            "protocol": {
                "ingress": {
                    "verification_strategy": "HMAC_SHA256_TIMESTAMPED",
                    "signature_header": "X-Signature",
                    "request_id_header": "X-Request-Id",
                    "timestamp_header": "X-Timestamp",
                    "nonce_header": "X-Nonce",
                    "event_type_path": "event_type",
                    "event_id_path": "request_id",
                    "batch_id_path": "batch_id",
                    "period_path": "period",
                    "records_path": "records",
                    "rate_limit_per_minute": 120,
                    "rate_limit_burst": 10,
                    "max_body_bytes": 1048576,
                }
            },
        },
        "credential_requirement": {"auth_type": "hmac_sha256_timestamped", "required_secret_keys": ["signing_secret"]},
        "object_template": {"object_type": "EVENT_TYPE", "multiple": True, "event_definition_source_system_type": "COST_ALLOCATION_SYSTEM", "config_schema": [], "default_objects": [{"object_code": "ALLOCATION_PERIOD_LOCKED", "object_name": "周期锁定", "event_definition_code": "allocation_period.locked", "is_active": True}]},
        "instance_override_policy": {"allowed_fields": ["credential_id", "protocol.ingress.rate_limit_per_minute", "protocol.ingress.rate_limit_burst"]},
    }
    bind.execute(
        sa.text("UPDATE ucp_connector_package SET system_schema = CAST(:schema AS json) WHERE package_code = :package_code"),
        {"schema": json.dumps(schema, ensure_ascii=True), "package_code": "COST_ALLOCATION_LOCKED_INGRESS"},
    )


def downgrade() -> None:
    op.drop_index("ix_ucp_resource_source_template", table_name="ucp_resource")
    op.drop_column("ucp_resource", "source_template_code")
    op.drop_constraint("fk_ucp_resource_source_template", "ucp_resource", type_="foreignkey")
    op.drop_column("ucp_resource", "source_template_id")