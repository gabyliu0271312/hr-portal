import pytest

from app.connectors.catalog import (
    detect_resource_configuration_profile,
    get_connector_type,
    list_connector_types,
    list_resource_configuration_profiles,
    resolve_resource_configuration_profile,
)
from app.ucp.routers.capabilities import _resource_template_metadata


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


def test_webhook_ingress_is_registered_once_as_an_event_ingress_connector():
    webhook_connectors = [item for item in list_connector_types("ucp") if item["code"] == "webhook_ingress"]

    assert len(webhook_connectors) == 1
    assert webhook_connectors[0]["connection_kind"] == "EVENT_INGRESS"

def test_table_profiles_share_one_object_type_and_keep_provider_dispatch_internal():
    profiles = list_resource_configuration_profiles("TABLE")

    assert {profile["code"] for profile in profiles} == {"feishu_sheet", "feishu_bitable"}
    assert {profile["object_type"] for profile in profiles} == {"TABLE"}

    resolved = resolve_resource_configuration_profile(
        object_type="TABLE",
        configuration_profile="feishu_bitable",
    )

    assert resolved["connector_type"] == "feishu_bitable"
    assert resolved["adapter_code"] == "FEISHU_BITABLE_PULL_ADAPTER"


def test_resource_profile_requires_a_matching_persisted_profile():
    with pytest.raises(ValueError, match="RESOURCE_TEMPLATE_CONFIGURATION_PROFILE_INVALID"):
        resolve_resource_configuration_profile(object_type="EVENT_TYPE", configuration_profile=None)

    with pytest.raises(ValueError, match="RESOURCE_TEMPLATE_CONFIGURATION_PROFILE_OBJECT_TYPE_MISMATCH"):
        resolve_resource_configuration_profile(object_type="REPORT", configuration_profile="feishu_sheet")

def test_table_profile_is_detected_from_locator_fields_without_client_profile():
    bitable = detect_resource_configuration_profile(
        object_type="TABLE",
        object_template={"default_object_config": {"app_token": "app_x", "table_id": "tbl_x"}},
    )
    assert bitable["code"] == "feishu_bitable"

    with pytest.raises(ValueError, match="RESOURCE_TEMPLATE_TABLE_PROFILE_AMBIGUOUS"):
        detect_resource_configuration_profile(
            object_type="TABLE",
            object_template={"default_object_config": {"spreadsheet_token": "sht_x", "app_token": "app_x"}},
        )


@pytest.mark.parametrize(
    ("object_type", "object_config", "error"),
    [
        ("TABLE", {"spreadsheet_token": "sht_x", "range": "A1:Z100"}, "sheet_id"),
        ("TABLE", {"app_token": "app_x", "view_id": "vew_x"}, "table_id"),
        ("REPORT", {}, "report_id"),
    ],
)
def test_resource_profile_requires_complete_provider_locator_fields(object_type, object_config, error):
    with pytest.raises(ValueError, match=error):
        detect_resource_configuration_profile(
            object_type=object_type,
            object_template={"default_object_config": object_config},
        )


def test_template_metadata_persists_server_derived_profile_and_runtime_binding():
    schema = {
        "parent_package_code": "feishu",
        "resource_defaults": {"resource_code": "ATTENDANCE", "resource_name": "Attendance"},
        "object_template": {
            "object_type": "TABLE",
            "default_object_config": {"app_token": "app_x", "table_id": "tbl_x"},
        },
        "runtime_binding": {"adapter_code": "FORGED"},
    }

    parent_package_code, connector_type = _resource_template_metadata(schema)

    assert parent_package_code == "FEISHU"
    assert connector_type == "feishu_bitable"
    assert schema["resource_defaults"]["configuration_profile"] == "feishu_bitable"
    assert schema["runtime_binding"] == {"adapter_code": "FEISHU_BITABLE_PULL_ADAPTER"}

def test_event_profile_requires_a_valid_webhook_ingress_protocol():
    with pytest.raises(ValueError, match="Webhook resource protocol"):
        detect_resource_configuration_profile(
            object_type="EVENT_TYPE",
            resource_defaults={"protocol": {}},
            object_template={"default_object_config": {}},
        )

    profile = detect_resource_configuration_profile(
        object_type="EVENT_TYPE",
        resource_defaults={
            "protocol": {
                "ingress": {
                    "verification_strategy": "HMAC_SHA256_TIMESTAMPED",
                    "signature_header": "X-Signature",
                    "timestamp_header": "X-Timestamp",
                    "nonce_header": "X-Nonce",
                    "request_id_header": "X-Request-Id",
                    "event_id_path": "request_id",
                    "max_timestamp_diff_seconds": 300,
                    "rate_limit_per_minute": 120,
                    "rate_limit_burst": 10,
                    "max_body_bytes": 1048576,
                }
            }
        },
        object_template={"default_object_config": {}},
    )
    assert profile["code"] == "webhook_ingress"