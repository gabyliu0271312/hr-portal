"""Business-facing starter template for pending-hire enrichment."""
from __future__ import annotations


PENDING_HIRE_OFFER_ENRICHMENT_TEMPLATE = {
    "template_code": "PENDING_HIRE_OFFER_ENRICHMENT",
    "name": "待入职人员入仓及 Offer 薪酬补充",
    "description": "选择北森报表待入职来源、飞书 Offer 能力和目标数据资产后使用。",
    "version": "1.0.0",
    "nodes": [
        {"id": "read_pending", "type": "CONNECTOR", "x": 80, "y": 180, "label": "读取待入职人员", "config": {}},
        {"id": "lookup_offer", "type": "CAPABILITY_LOOKUP", "x": 340, "y": 180, "label": "按投递记录 ID 查询 Offer", "config": {"input_key": "${read_pending.result.data}", "lookup_field": "application_id", "parameter_name": "application_id"}},
        {"id": "merge_offer", "type": "RECORD_MERGE", "x": 630, "y": 180, "label": "补全 Offer 字段", "config": {"input_key": "${lookup_offer.result.data}", "field_mapping": []}},
        {"id": "write_asset", "type": "WAREHOUSE_ASSET_SINK", "x": 890, "y": 180, "label": "写入待入职人员资产", "config": {"input_key": "${merge_offer.result.data}", "write_mode": "upsert", "field_whitelist": []}},
    ],
    "edges": [{"from": "read_pending", "to": "lookup_offer"}, {"from": "lookup_offer", "to": "merge_offer"}, {"from": "merge_offer", "to": "write_asset"}],
}
