from app.connectors.catalog import get_connector_type, list_connector_types


def test_catalog_filters_by_consumer_and_hides_values():
    warehouse = {item["code"]: item for item in list_connector_types("warehouse")}
    ucp = {item["code"]: item for item in list_connector_types("ucp")}

    assert "feishu_sheet" in warehouse
    assert "feishu_bitable" in warehouse
    assert "feishu_bitable" in ucp
    assert ucp["feishu_bitable"]["ucp_adapter_code"] == "FEISHU_BITABLE_PULL_ADAPTER"
    assert "FEISHU_APP_SECRET" in warehouse["feishu_sheet"]["secret_keys"]
    secret_field = warehouse["feishu_sheet"]["groups"][0]["fields"][1]
    assert secret_field == {"key": "FEISHU_APP_SECRET", "label": "App Secret", "type": "password", "required": True}


def test_catalog_returns_defensive_copy():
    connector = get_connector_type("feishu_sheet")
    assert connector is not None
    connector["label"] = "changed"
    assert get_connector_type("feishu_sheet")["label"] == "\u98de\u4e66\u5728\u7ebf\u8868\u683c"
