from app.ucp.pipeline_template import NODE_TYPES
from app.ucp.x0210_template import PENDING_HIRE_OFFER_ENRICHMENT_TEMPLATE


def test_pending_hire_offer_enrichment_template_has_complete_business_flow():
    template = PENDING_HIRE_OFFER_ENRICHMENT_TEMPLATE

    assert template["template_code"] == "PENDING_HIRE_OFFER_ENRICHMENT"
    assert [node["type"] for node in template["nodes"]] == [
        "CONNECTOR", "CAPABILITY_LOOKUP", "RECORD_MERGE", "WAREHOUSE_ASSET_SINK",
    ]
    assert {"CAPABILITY_LOOKUP", "RECORD_MERGE", "WAREHOUSE_ASSET_SINK"}.issubset(NODE_TYPES)
    assert len(template["edges"]) == 3
