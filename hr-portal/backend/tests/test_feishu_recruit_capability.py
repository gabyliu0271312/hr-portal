import pytest

from app.ucp.adapters import FeishuRecruitClient
from app.ucp.feishu_recruit_capability import (
    FEISHU_RECRUIT_OPERATIONS,
    FEISHU_RECRUIT_PACKAGE_CODE,
    ensure_feishu_recruit_capability_package,
)


class _FakeFeishuResponse:
    def __init__(self, payload):
        self.status_code = 200
        self._payload = payload

    def json(self):
        return self._payload


class _FakeFeishuHttpClient:
    get_url = None
    get_kwargs = None

    def __init__(self, **_kwargs):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_args):
        return None

    async def post(self, *_args, **_kwargs):
        return _FakeFeishuResponse({"code": 0, "tenant_access_token": "token", "expire": 7200})

    async def get(self, url, **kwargs):
        type(self).get_url = url
        type(self).get_kwargs = kwargs
        return _FakeFeishuResponse({"code": 0, "data": {"id": "offer-001"}})


class _ScalarResult:
    def __init__(self, value):
        self.value = value

    def scalar_one_or_none(self):
        return self.value


class _RowsResult:
    def __init__(self, rows):
        self.rows = rows

    def all(self):
        return self.rows

    def scalars(self):
        return self


class _ExistingPackageSession:
    def __init__(self):
        self.package = type("Package", (), {"id": 42, "package_code": FEISHU_RECRUIT_PACKAGE_CODE})()
        self.added = []
        self.committed = False
        self.refreshed = None
        self.execute_count = 0

    async def execute(self, _statement):
        self.execute_count += 1
        if self.execute_count == 1:
            return _ScalarResult(self.package)
        return _RowsResult([
            type("Operation", (), {"object_code": item["object_code"], "operation_code": item["operation_code"]})()
            for item in FEISHU_RECRUIT_OPERATIONS
        ])

    def add(self, entity):
        self.added.append(entity)

    async def commit(self):
        self.committed = True

    async def refresh(self, entity):
        self.refreshed = entity


def test_feishu_recruit_package_exposes_offer_candidate_and_job_operations():
    assert FEISHU_RECRUIT_PACKAGE_CODE == "FEISHU_RECRUIT"
    assert {item["object_code"] for item in FEISHU_RECRUIT_OPERATIONS} == {"OFFER", "CANDIDATE", "JOB"}


def test_offer_operation_requires_application_id_and_marks_salary_sensitive():
    offer = next(item for item in FEISHU_RECRUIT_OPERATIONS if item["object_code"] == "OFFER")
    assert offer["input_schema"]["required"] == ["application_id"]
    assert offer["output_schema"]["properties"]["salary_amount"]["sensitivity"] == "compensation_high"
    assert offer["required_scopes"] == ["hire:application:readonly"]


def test_every_prebuilt_operation_is_read_only_and_versionable():
    for operation in FEISHU_RECRUIT_OPERATIONS:
        assert operation["operation_code"].startswith("QUERY_")
        assert operation["adapter_code"].startswith("FEISHU_")


@pytest.mark.asyncio
async def test_offer_detail_uses_application_offer_endpoint(monkeypatch):
    import httpx

    _FakeFeishuHttpClient.get_url = None
    _FakeFeishuHttpClient.get_kwargs = None
    monkeypatch.setattr(httpx, "AsyncClient", _FakeFeishuHttpClient)

    offer = await FeishuRecruitClient("app-id", "app-secret").get_offer_detail("application-001")

    assert offer == {"id": "offer-001"}
    assert _FakeFeishuHttpClient.get_url == (
        "https://open.feishu.cn/open-apis/hire/v1/applications/application-001/offer"
    )
    assert "params" not in _FakeFeishuHttpClient.get_kwargs


@pytest.mark.asyncio
async def test_capability_package_seed_is_idempotent_when_package_and_operations_exist():
    db = _ExistingPackageSession()

    package = await ensure_feishu_recruit_capability_package(db)

    assert package is db.package
    assert db.added == []
    assert db.committed is True
    assert db.refreshed is db.package
