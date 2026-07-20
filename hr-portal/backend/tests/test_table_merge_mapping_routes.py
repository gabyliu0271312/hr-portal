from types import SimpleNamespace

from fastapi import FastAPI, HTTPException, status
from fastapi.routing import APIRoute
from fastapi.testclient import TestClient

from app.core.db import get_session
from app.table_tools import router as table_routes
from app.table_tools.models import MergeSourceMapping, MergeTemplate


class FakeDb:
    def __init__(self) -> None:
        self.commits = 0
        self.deleted: list[object] = []
        self.next_mapping_id = 100

    async def commit(self) -> None:
        self.commits += 1

    async def refresh(self, item: object, *_attrs: object) -> None:
        if isinstance(item, MergeSourceMapping) and item.id is None:
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