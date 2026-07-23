from app.connectors.catalog import get_connector_type, list_connector_types


def test_data_object_connectors_are_shared_by_warehouse_and_ucp():
    warehouse = {item["code"] for item in list_connector_types("warehouse")}
    ucp = {item["code"] for item in list_connector_types("ucp")}

    assert {"feishu_sheet", "feishu_bitable", "beisen_report"}.issubset(warehouse)
    assert {"feishu_sheet", "feishu_bitable", "beisen_report"}.issubset(ucp)


def test_beisen_report_is_a_data_object_connector_not_the_whole_beisen_system():
    connector = get_connector_type("beisen_report")

    assert connector["connection_kind"] == "DATA_OBJECT"
    assert connector["legacy_source_types"] == ["beisen_api"]


def test_product_catalog_hides_adapter_codes_but_internal_mapping_is_available():
    public = get_connector_type("feishu_sheet")
    internal = get_connector_type("feishu_sheet", include_internal=True)

    assert "ucp_adapter_code" not in public
    assert internal["ucp_adapter_code"] == "FEISHU_SHEET_PULL_ADAPTER"


def test_beisen_warehouse_schema_and_ucp_object_schema_are_layered():
    connector = get_connector_type("beisen_report", include_internal=True)
    warehouse_fields = {
        field["key"]
        for group in connector["groups"]
        for field in group["fields"]
    }

    assert {"BEISEN_APP_KEY", "BEISEN_APP_SECRET", "BEISEN_TOKEN_URL", "BEISEN_HEADER_URL", "BEISEN_DATA_URL", "BEISEN_REPORT_ID"}.issubset(warehouse_fields)
    assert [field["key"] for field in connector["ucp_object_fields"]] == ["report_id"]
    assert connector["ucp_adapter_code"] == "BEISEN_REPORT_PULL_ADAPTER"
    assert "BEISEN_PENDING_LIST_ADAPTER" in connector["legacy_ucp_adapter_codes"]
