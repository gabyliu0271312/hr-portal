"""normalize pipeline node titles and preserve business aliases

Revision ID: 0130
Revises: 0129
Create Date: 2026-07-25
"""
import json

import sqlalchemy as sa
from alembic import op


revision = "0130"
down_revision = "0129"
branch_labels = None
depends_on = None


NODE_LABELS = {
    "START_TRIGGER": "\u6d41\u7a0b\u8d77\u70b9",
    "CONNECTOR": "\u8d44\u6e90\u8c03\u7528",
    "CAPABILITY": "\u4e1a\u52a1\u80fd\u529b",
    "CAPABILITY_LOOKUP": "\u9010\u6761\u67e5\u8be2",
    "TRANSFORM": "\u5b57\u6bb5\u8f6c\u6362",
    "RECORD_MERGE": "\u8bb0\u5f55\u5408\u5e76",
    "WAREHOUSE_ASSET_SINK": "\u8d44\u4ea7\u5199\u5165",
    "BRANCH": "\u6761\u4ef6\u5206\u652f",
    "LOOP": "\u5217\u8868\u5faa\u73af",
    "WAIT": "\u5ef6\u65f6\u7b49\u5f85",
    "TIME_STRATEGY": "\u65f6\u95f4\u7b56\u7565",
    "APPROVAL": "\u4eba\u5de5\u5ba1\u6279",
    "NOTIFY": "\u6d88\u606f\u901a\u77e5",
}


def _normalize(nodes: list | None) -> list:
    result = []
    for node in nodes or []:
        item = dict(node)
        canonical_label = NODE_LABELS.get(item.get("type"))
        if canonical_label:
            previous_label = str(item.get("label") or "").strip()
            config = dict(item.get("config") or {})
            if previous_label and previous_label != canonical_label and not config.get("business_alias"):
                config["business_alias"] = previous_label[:64]
            item["label"] = canonical_label
            item["config"] = config
        result.append(item)
    return result


def _restore(nodes: list | None) -> list:
    result = []
    for node in nodes or []:
        item = dict(node)
        config = dict(item.get("config") or {})
        alias = config.pop("business_alias", None)
        if isinstance(alias, str) and alias.strip():
            item["label"] = alias.strip()
        item["config"] = config
        result.append(item)
    return result


def _update(transform) -> None:
    bind = op.get_bind()
    for table_name in ("ucp_pipeline_template", "ucp_pipeline_template_version"):
        rows = bind.execute(sa.text(f"SELECT id, nodes_json FROM {table_name}")).mappings().all()
        for row in rows:
            bind.execute(
                sa.text(f"UPDATE {table_name} SET nodes_json = CAST(:nodes AS JSONB) WHERE id = :id"),
                {"id": row["id"], "nodes": json.dumps(transform(row["nodes_json"]))},
            )


def upgrade() -> None:
    _update(_normalize)


def downgrade() -> None:
    _update(_restore)
