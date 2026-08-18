import asyncio
from types import SimpleNamespace

from fastapi import FastAPI, HTTPException, status
from fastapi.routing import APIRoute
from fastapi.testclient import TestClient

from app.core.db import get_session
from app.table_tools import router as table_routes
from app.table_tools import dwd_relation_service
from app.table_tools.models import MergeDwdRelation, MergeSourceMapping, MergeTemplate


class FakeDb:
    def __init__(self) -> None:
        self.commits = 0
        self.deleted: list[object] = []
        self.next_mapping_id = 100

    async def commit(self) -> None:
        self.commits += 1

    async def refresh(self, item: object, *_attrs: object) -> None:
        if isinstance(item, (MergeSourceMapping, MergeDwdRelation)) and item.id is None:
            item.id = self.next_mapping_id
            self.next_mapping_id += 1

    async def delete(self, item: object) -> None:
        self.deleted.append(item)
        if isinstance(item, MergeSourceMapping) and item in item.template.mappings:
            item.template.mappings.remove(item)


def _mapping(
    mapping_id: int | None = 10,
    name: str = "existing-source",
) -> MergeSourceMapping:
    return MergeSourceMapping(
        id=mapping_id,
        template_id=1,
        name=name,
        match_signature=["employee_id", "employee_name", "amount"],
        header_start=1,
        header_end=1,
        key_map={"employee_id": "employee_id"},
        column_map={"amount": "amount"},
        derived_fields=[],
        skip_tokens=["total"],
    )


def _template(*mappings: MergeSourceMapping) -> MergeTemplate:
    template = MergeTemplate(
        id=1,
        name="template",
        description=None,
        merge_keys=["employee_id"],
        std_fields=["amount"],
        aggregate="sum",
        version=1,
        created_by=7,
    )
    template.mappings.extend(mappings)
    return template


def _payload(name: str = "new-source") -> dict:
    return {
        "name": name,
        "match_signature": ["employee_id", "employee_name", "amount"],
        "header_start": 1,
        "header_end": 1,
        "key_map": {"employee_id": "employee_id"},
        "column_map": {"amount": "amount"},
        "derived_fields": [],
        "skip_tokens": ["total"],
    }


def _dwd_payload(name: str = "employee-dwd", **source: int) -> dict:
    return {
        "name": name,
        **source,
        "left_fields": ["employee_id"],
        "right_fields": ["dwd.employee_id"],
        "select_fields": ["dwd.department"],
        "missing_policy": "anomaly",
        "multiple_policy": "anomaly",
        "enabled": True,
    }


def _client(db: FakeDb) -> TestClient:
    app = FastAPI()
    app.include_router(table_routes.router, prefix="/api/v1")
    app.dependency_overrides[get_session] = lambda: db
    for route in app.routes:
        if not isinstance(route, APIRoute):
            continue
        for dependency in route.dependant.dependencies:
            if dependency.call is not get_session:
                app.dependency_overrides[dependency.call] = lambda: SimpleNamespace(id=7)
    return TestClient(app)


def _install_template(monkeypatch, template: MergeTemplate) -> None:
    async def load_template(_db: FakeDb, tid: int) -> MergeTemplate:
        if tid != template.id:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="template not found")
        return template

    async def allow_modify(_db: FakeDb, _template: MergeTemplate, _user: object) -> None:
        return None

    monkeypatch.setattr(table_routes, "_load_template", load_template)
    monkeypatch.setattr(table_routes, "_ensure_can_modify", allow_modify)


def test_mapping_crud_routes_cover_success_and_validation_statuses(monkeypatch):
    db = FakeDb()
    template = _template(_mapping())
    _install_template(monkeypatch, template)
    client = _client(db)

    created = client.post("/api/v1/table-tools/templates/1/mappings", json=_payload())
    assert created.status_code == status.HTTP_201_CREATED
    assert created.json()["id"] == 100

    invalid = client.post(
        "/api/v1/table-tools/templates/1/mappings",
        json={**_payload("invalid-source"), "match_signature": ["employee_id", "amount"]},
    )
    assert invalid.status_code == status.HTTP_400_BAD_REQUEST

    conflict = client.post("/api/v1/table-tools/templates/1/mappings", json=_payload())
    assert conflict.status_code == status.HTTP_409_CONFLICT

    missing_template = client.post("/api/v1/table-tools/templates/999/mappings", json=_payload("other"))
    assert missing_template.status_code == status.HTTP_404_NOT_FOUND

    update_invalid = client.put(
        "/api/v1/table-tools/templates/1/mappings/10",
        json={**_payload("updated-source"), "match_signature": ["employee_id"]},
    )
    assert update_invalid.status_code == status.HTTP_400_BAD_REQUEST

    update_missing = client.put("/api/v1/table-tools/templates/1/mappings/999", json=_payload("updated-source"))
    assert update_missing.status_code == status.HTTP_404_NOT_FOUND

    update_conflict = client.put("/api/v1/table-tools/templates/1/mappings/10", json=_payload("new-source"))
    assert update_conflict.status_code == status.HTTP_409_CONFLICT

    deleted = client.delete("/api/v1/table-tools/templates/1/mappings/10")
    assert deleted.status_code == status.HTTP_204_NO_CONTENT

    delete_missing = client.delete("/api/v1/table-tools/templates/1/mappings/10")
    assert delete_missing.status_code == status.HTTP_404_NOT_FOUND


def test_mapping_crud_routes_return_forbidden_when_owner_check_fails(monkeypatch):
    db = FakeDb()
    template = _template(_mapping())
    _install_template(monkeypatch, template)

    async def forbid_modify(_db: FakeDb, _template: MergeTemplate, _user: object) -> None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="forbidden")

    monkeypatch.setattr(table_routes, "_ensure_can_modify", forbid_modify)
    client = _client(db)

    assert client.post("/api/v1/table-tools/templates/1/mappings", json=_payload()).status_code == 403
    assert client.put("/api/v1/table-tools/templates/1/mappings/10", json=_payload()).status_code == 403
    assert client.delete("/api/v1/table-tools/templates/1/mappings/10").status_code == 403


def test_update_template_rejects_duplicate_mapping_ids_before_mutation(monkeypatch):
    db = FakeDb()
    template = _template(_mapping())
    _install_template(monkeypatch, template)
    client = _client(db)

    response = client.put(
        "/api/v1/table-tools/templates/1",
        json={
            "name": "template",
            "description": None,
            "merge_keys": ["employee_id"],
            "std_fields": ["amount"],
            "aggregate": "sum",
            "mappings": [
                {**_payload("first-update"), "id": 10},
                {**_payload("second-update"), "id": 10},
            ],
        },
    )

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert template.mappings[0].name == "existing-source"
    assert db.deleted == []
    assert db.commits == 0


def test_mapping_draft_response_model_is_serialized_and_documented():
    response = table_routes.MappingDraftOut.model_validate(
        {
            "mapping": {
                **_payload("ai-source"),
                "_confidence": 0.6,
                "_notes": "needs review",
            },
            "available_sheets": ["Sheet1"],
            "effective_headers": ["employee_id", "employee_name", "amount"],
            "low_confidence": [{"sheet": "Sheet1", "confidence": 0.6, "notes": "needs review"}],
            "warnings": [],
        }
    )
    assert response.mapping.confidence == 0.6
    assert response.model_dump(by_alias=True)["mapping"]["_confidence"] == 0.6

    app = FastAPI()
    app.include_router(table_routes.router, prefix="/api/v1")
    route = next(route for route in app.routes if getattr(route, "path", None) == "/api/v1/table-tools/templates/{tid}/mapping-draft")
    assert route.response_model is table_routes.MappingDraftOut

    schema = app.openapi()
    response_schema = schema["paths"][route.path]["post"]["responses"]["200"]["content"]["application/json"]["schema"]
    assert response_schema == {"$ref": "#/components/schemas/MappingDraftOut"}
    assert "_confidence" in schema["components"]["schemas"]["MappingDraftMappingOut"]["properties"]


def test_batch_create_mappings_is_atomic_and_returns_created_mappings(monkeypatch):
    db = FakeDb()
    template = _template(_mapping())
    _install_template(monkeypatch, template)
    client = _client(db)

    created = client.post(
        "/api/v1/table-tools/templates/1/mappings/batch",
        json={"mappings": [_payload("source-a"), _payload("source-b")]},
    )

    assert created.status_code == status.HTTP_201_CREATED
    assert [item["name"] for item in created.json()["mappings"]] == ["source-a", "source-b"]
    assert [item["id"] for item in created.json()["mappings"]] == [100, 101]
    assert template.version == 2


def test_batch_create_mappings_rejects_all_when_one_name_conflicts(monkeypatch):
    db = FakeDb()
    template = _template(_mapping())
    _install_template(monkeypatch, template)
    client = _client(db)

    response = client.post(
        "/api/v1/table-tools/templates/1/mappings/batch",
        json={"mappings": [_payload("source-a"), _payload("source-a")]},
    )

    assert response.status_code == status.HTTP_409_CONFLICT
    assert [item.name for item in template.mappings] == ["existing-source"]
    assert db.commits == 0


def test_batch_mapping_draft_route_is_documented():
    app = FastAPI()
    app.include_router(table_routes.router, prefix="/api/v1")
    route = next(
        route for route in app.routes
        if getattr(route, "path", None) == "/api/v1/table-tools/templates/{tid}/mapping-drafts"
    )
    assert route.response_model is table_routes.MappingDraftsOut


def test_dwd_relation_routes_support_dataset_and_legacy_report_sources(monkeypatch):
    db = FakeDb()
    template = _template()
    legacy = MergeDwdRelation(
        id=10,
        template_id=1,
        name="legacy-report",
        report_id=9,
        dataset_id=None,
        left_fields=["employee_id"],
        right_fields=["dwd.employee_id"],
        select_fields=["dwd.department"],
    )
    template.dwd_relations.append(legacy)
    _install_template(monkeypatch, template)

    fields = [{"code": "dwd.employee_id"}, {"code": "dwd.department"}]

    async def dataset_fields(dataset_id: int, _user: object, _db: FakeDb) -> list[dict]:
        assert dataset_id == 8
        return fields

    async def report_fields(report_id: int, _user: object, _db: FakeDb) -> list[dict]:
        assert report_id == 9
        return fields

    async def dataset_context(dataset_id: int, _user: object, _db: FakeDb) -> object:
        assert dataset_id == 8
        return object()

    async def report_context(report_id: int, _user: object, _db: FakeDb) -> tuple[object, object]:
        assert report_id == 9
        return object(), object()

    monkeypatch.setattr(table_routes, "list_dwd_fields_by_dataset", dataset_fields)
    monkeypatch.setattr(table_routes, "list_dwd_fields", report_fields)
    monkeypatch.setattr(table_routes, "load_dataset_dwd_context", dataset_context)
    monkeypatch.setattr(table_routes, "load_dwd_context", report_context)
    client = _client(db)

    listed = client.get("/api/v1/table-tools/templates/1/dwd-relations")
    assert listed.status_code == status.HTTP_200_OK
    assert listed.json()[0]["dataset_id"] is None
    assert listed.json()[0]["report_id"] == 9

    missing = client.post("/api/v1/table-tools/templates/1/dwd-relations", json=_dwd_payload())
    assert missing.status_code == status.HTTP_400_BAD_REQUEST

    created = client.post(
        "/api/v1/table-tools/templates/1/dwd-relations",
        json=_dwd_payload("dataset-source", dataset_id=8),
    )
    assert created.status_code == status.HTTP_201_CREATED
    assert created.json()["dataset_id"] == 8
    assert created.json()["report_id"] is None

    updated = client.put(
        "/api/v1/table-tools/templates/1/dwd-relations/10",
        json=_dwd_payload("legacy-report", report_id=9),
    )
    assert updated.status_code == status.HTTP_200_OK
    assert updated.json()["dataset_id"] is None
    assert updated.json()["report_id"] == 9


def test_list_dwd_sources_uses_dataset_permissions_and_filters_ineligible(monkeypatch):
    eligible = SimpleNamespace(id=8, name="employee", label="员工", warehouse_layer="DWD", is_active=True, status="published")
    non_dwd = SimpleNamespace(id=9, name="ods", label=None, warehouse_layer="ODS", is_active=True, status="published")
    inactive = SimpleNamespace(id=10, name="inactive", label=None, warehouse_layer="DWD", is_active=False, status="published")

    class Result:
        def scalars(self): return self
        def all(self): return [eligible, non_dwd, inactive]

    class SourceDb:
        async def execute(self, _query): return Result()
        async def get(self, _model, dataset_id):
            return {8: eligible, 9: non_dwd, 10: inactive}.get(dataset_id)

    async def can_access(_user, dataset, _db):
        return dataset.id == 8

    monkeypatch.setattr(dwd_relation_service, "dataset_can_access", can_access)
    result = asyncio.run(dwd_relation_service.list_dwd_sources(SimpleNamespace(), SourceDb()))

    assert result == [{
        "dataset_id": 8,
        "dataset_name": "employee",
        "dataset_label": "员工",
        "report_id": None,
        "report_name": None,
    }]


def test_apply_dwd_relation_validates_dataset_fields_with_report_config(monkeypatch):
    relation = SimpleNamespace(
        enabled=True,
        dataset_id=8,
        report_id=None,
        left_fields=["employee_id"],
        right_fields=["dwd.employee_id"],
        select_fields=["dwd.department"],
        missing_policy="anomaly",
        multiple_policy="anomaly",
        name="employee-dwd",
    )
    validated: list[object] = []

    async def dataset_context(dataset_id: int, _user: object, _db: object) -> object:
        assert dataset_id == 8
        return SimpleNamespace(id=8)

    async def validate(config: object, dataset_id: int, _user: object, _db: object) -> None:
        validated.append(config)
        assert dataset_id == 8

    async def query(_dataset_id: int, **kwargs: object) -> tuple[None, list[dict[str, str]], int]:
        assert kwargs["columns"] == ["dwd.employee_id", "dwd.department"]
        return None, [{"dwd.employee_id": "E001", "dwd.department": "人事部"}], 1

    monkeypatch.setattr(dwd_relation_service, "load_dataset_dwd_context", dataset_context)
    monkeypatch.setattr(dwd_relation_service, "ensure_valid_report_field_references", validate)
    monkeypatch.setattr(dwd_relation_service, "run_dataset_query", query)

    result, anomalies = asyncio.run(
        dwd_relation_service.apply_dwd_relation(
            [{"employee_id": "E001"}], relation, SimpleNamespace(), SimpleNamespace()
        )
    )

    assert result == [{"employee_id": "E001", "dwd.department": "人事部"}]
    assert anomalies == []
    assert len(validated) == 1
    assert isinstance(validated[0], dwd_relation_service.ReportConfig)
    assert [column.source_code for column in validated[0].columns] == [
        "dwd.employee_id",
        "dwd.department",
    ]
