from app.ucp.builtin_adapter_definitions import BUILTIN_ADAPTER_DEFINITIONS


def test_builtin_adapter_catalogue_includes_lifecycle_adapters():
    definitions = {
        item["adapter_code"]: item for item in BUILTIN_ADAPTER_DEFINITIONS
    }

    assert "DIDI_ACCOUNT_PUSH_ADAPTER" in definitions
    assert "CAOCAO_ACCOUNT_PUSH_ADAPTER" in definitions
    assert definitions["DIDI_ACCOUNT_PUSH_ADAPTER"]["schema"]["categories"][0]["key"] == "protocol"


def test_builtin_adapter_catalogue_has_unique_active_codes():
    codes = [item["adapter_code"] for item in BUILTIN_ADAPTER_DEFINITIONS]

    assert len(codes) == len(set(codes))
    assert {
        "BEISEN_PENDING_LIST_ADAPTER",
        "FEISHU_OFFER_DETAIL_ADAPTER",
        "FEISHU_BITABLE_PULL_ADAPTER",
        "EXCEL_IMPORT_ADAPTER",
        "DATASOURCE_BRIDGE_ADAPTER",
        "PUSH_TARGET_BRIDGE_ADAPTER",
        "DIDI_ACCOUNT_PUSH_ADAPTER",
        "CAOCAO_ACCOUNT_PUSH_ADAPTER",
        "OA_ORG_PULL_ADAPTER",
        "OA_TARGET_PULL_ADAPTER",
        "OA_ORG_DIFF_ADAPTER",
        "OA_ORG_PUSH_ADAPTER",
    } == set(codes)