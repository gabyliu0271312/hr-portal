"""通用设计期字段发现 service 单元测试。

覆盖：北森报表等 connector_type → make_client.discover_fields() 的通用映射，
以及 adapter schema 静态字段回退；不依赖真实凭证或外部 API。
"""
from __future__ import annotations

import pytest
from types import SimpleNamespace

from app.ucp.field_catalog_service import (
    FieldCatalogError,
    build_resource_field_catalog,
    _connector_settings,
    _infer_field_type,
)


def _resource(connector_type="beisen_report", credential_id=1, protocol=None, report_config=None, adapter_code="BEISEN_REPORT_PULL_ADAPTER"):
    return SimpleNamespace(
        id=10,
        resource_code="beisen_org_report",
        resource_name="北森组织报表",
        connector_type=connector_type,
        adapter_code=adapter_code,
        credential_id=credential_id,
        protocol=protocol or {},
        report_config=report_config or {},
    )


@pytest.fixture
def fake_connector():
    return {
        "code": "beisen_report",
        "protocol": "beisen_report",
        "ucp_connection_defaults": {
            "BEISEN_TOKEN_URL": "https://openapi.italent.cn/token",
            "BEISEN_HEADER_URL": "https://openapi.italent.cn/Ocean/api/v2/Reports/GridHeader",
            "BEISEN_DATA_URL": "https://openapi.italent.cn/Ocean/api/v2/Reports/GridData",
        },
    }


def test_connector_settings_merges_object_config_report_id(monkeypatch, fake_connector):
    from app.ucp import field_catalog_service as svc

    monkeypatch.setattr(svc, "get_connector_type", lambda code, **kw: fake_connector)
    resource = _resource(report_config={"BEISEN_REPORT_ID": "report-a"})
    settings = _connector_settings(fake_connector, resource, {"report_id": "report-b"})
    assert settings["BEISEN_REPORT_ID"] == "report-b"


def test_infer_field_type():
    assert _infer_field_type([]) == "string"
    assert _infer_field_type([1, 2.5]) == "number"
    assert _infer_field_type(["1", "2.0"]) == "number"
    assert _infer_field_type([True]) == "boolean"
    assert _infer_field_type(["部门A"]) == "string"


def test_build_resource_field_catalog_via_client(monkeypatch, fake_connector):
    from app.ucp import field_catalog_service as svc

    async def fake_discover_fields(self):
        return [
            {"source_key": "uuid-1", "label": "部门编码", "sample_values": ["D001", "D002"]},
            {"source_key": "uuid-2", "label": "部门名称", "sample_values": ["产品部", 12]},
            {"source_key": "uuid-3", "label": "上级编码", "sample_values": []},
        ]

    class FakeClient:
        async def discover_fields(self):
            return await fake_discover_fields(self)

    def fake_make_client(source_type, settings, secrets):
        return FakeClient()

    async def fake_decrypt(db, credential_id):
        return {"BEISEN_APP_KEY": "k", "BEISEN_APP_SECRET": "s"}

    monkeypatch.setattr(svc, "get_connector_type", lambda code, **kw: fake_connector)
    monkeypatch.setattr("app.datasources.beisen_client.make_client", fake_make_client)
    monkeypatch.setattr(svc, "decrypt_credential_secrets", fake_decrypt)

    import asyncio
    result = asyncio.run(build_resource_field_catalog(None, _resource()))
    assert len(result) == 3
    assert result[0] == {
        "source_key": "uuid-1",
        "label": "部门编码",
        "sample_values": ["D001", "D002"],
        "type": "string",
    }
    assert result[1]["type"] == "number"
    assert result[2]["type"] == "string"


def test_build_resource_field_catalog_via_adapter_schema(monkeypatch):
    """无 discover_fields 能力时回退 adapter schema 静态字段。"""
    from app.ucp import field_catalog_service as svc

    resource = _resource(connector_type=None, credential_id=None, adapter_code="OA_ORG_PULL_ADAPTER")

    class FakeDefinition:
        schema_json = {
            "categories": [
                {"key": "protocol", "label": "协议", "fields": [
                    {"key": "org_code", "label": "组织编码"},
                    {"key": "org_name", "label": "组织名称"},
                ]},
            ]
        }

    def fake_make_client(source_type, settings, secrets):
        raise RuntimeError("no client for this type")

    monkeypatch.setattr(svc, "get_connector_type", lambda code, **kw: None)
    monkeypatch.setattr("app.datasources.beisen_client.make_client", fake_make_client)
    monkeypatch.setattr(svc, "decrypt_credential_secrets", lambda db, id: {})

    monkeypatch.setattr("app.ucp.adapter_registry.get_adapter_definition", lambda code: FakeDefinition())
    monkeypatch.setattr("app.ucp.adapter_schema.extract_categories", lambda schema: schema.get("categories") or [])

    import asyncio
    result = asyncio.run(build_resource_field_catalog(None, resource))
    assert [item["source_key"] for item in result] == ["org_code", "org_name"]
    assert all(item["type"] == "string" for item in result)


def test_unsupported_resource_raises(monkeypatch):
    from app.ucp import field_catalog_service as svc

    resource = _resource(connector_type="unknown", credential_id=None, adapter_code="")
    monkeypatch.setattr(svc, "get_connector_type", lambda code, **kw: None)
    monkeypatch.setattr("app.ucp.adapter_registry.get_adapter_definition", lambda code: None)
    import asyncio

    with pytest.raises(FieldCatalogError):
        asyncio.run(build_resource_field_catalog(None, resource))
