import pytest

from app.ucp.adapters import (
    ADAPTER_REGISTRY,
    FeishuRecruitClient,
    feishu_offer_detail_adapter,
    feishu_recruit_candidate_adapter,
    feishu_recruit_candidate_list_adapter,
    feishu_recruit_job_adapter,
)
from app.ucp.feishu_recruit_capability import (
    FEISHU_RECRUIT_OPERATIONS,
    FEISHU_RECRUIT_PACKAGE_CODE,
    ensure_feishu_recruit_capability_package,
)


class _FakeFeishuResponse:
    def __init__(self, payload, status_code=200):
        self.status_code = status_code
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

    def __iter__(self):
        return iter(self.rows)

    def scalar_one_or_none(self):
        return self.rows[0] if self.rows else None


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


class _BootstrapSession:
    def __init__(self):
        self.added = []
        self.execute_count = 0
        self.next_id = 1

    async def execute(self, _statement):
        self.execute_count += 1
        if self.execute_count == 1:
            return _ScalarResult(None)
        if self.execute_count == 2:
            return _RowsResult([])
        return _ScalarResult(None)

    def add(self, entity):
        if getattr(entity, "id", None) is None:
            entity.id = self.next_id
            self.next_id += 1
        self.added.append(entity)

    async def flush(self):
        return None

    async def commit(self):
        return None

    async def refresh(self, _entity):
        return None


def test_feishu_recruit_package_exposes_offer_candidate_and_job_operations():
    assert FEISHU_RECRUIT_PACKAGE_CODE == "FEISHU_RECRUIT"
    assert {item["object_code"] for item in FEISHU_RECRUIT_OPERATIONS} == {"OFFER", "CANDIDATE", "JOB"}


def test_offer_operation_requires_application_id_and_marks_salary_sensitive():
    offer = next(item for item in FEISHU_RECRUIT_OPERATIONS if item["object_code"] == "OFFER")
    assert offer["input_schema"]["required"] == ["application_id"]
    assert offer["output_schema"]["properties"]["salary_amount"]["sensitivity"] == "compensation_high"
    assert offer["required_scopes"] == ["hire:application:readonly"]
    assert offer["adapter_code"] == "FEISHU_OFFER_DETAIL_ADAPTER"


def test_every_prebuilt_operation_is_template_backed_and_versionable():
    for operation in FEISHU_RECRUIT_OPERATIONS:
        assert operation["operation_code"].startswith("QUERY_")
        expected_adapter = "FEISHU_OFFER_DETAIL_ADAPTER" if operation["object_code"] == "OFFER" else "GENERIC_HTTP_ACTION_ADAPTER"
        assert operation["adapter_code"] == expected_adapter
        assert operation["template_code"].startswith("FEISHU_RECRUIT_")
        assert operation["path"].startswith("/open-apis/")


def test_every_capability_operation_has_a_registered_adapter():
    assert {item["adapter_code"] for item in FEISHU_RECRUIT_OPERATIONS}.issubset(ADAPTER_REGISTRY)


@pytest.mark.asyncio
async def test_prebuilt_operations_and_templates_are_automatically_published():
    session = _BootstrapSession()

    await ensure_feishu_recruit_capability_package(session)

    operations = [item for item in session.added if getattr(item, "__tablename__", "") == "ucp_operation_definition"]
    templates = [item for item in session.added if getattr(item, "__tablename__", "") == "ucp_api_template"]
    assert operations
    assert templates
    assert all(item.status == item.approval_status == "PUBLISHED" for item in operations)
    assert all(item.is_published == 1 for item in templates)


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
async def test_offer_adapter_normalizes_salary_and_rejects_missing_application_id(monkeypatch):
    missing = await feishu_offer_detail_adapter({}, {}, None)
    assert missing.error_code == "MISSING_APPLICATION_ID"

    async def offer_detail(_self, _application_id):
        return {"id": "offer-001", "status": "APPROVED", "salary": {"amount": 12000, "currency": "CNY"}}

    monkeypatch.setattr(FeishuRecruitClient, "get_offer_detail", offer_detail)
    result = await feishu_offer_detail_adapter({"application_id": "app-001"}, {"app_id": "id", "app_secret": "secret"}, None)

    assert result.status == "success"
    assert result.data == [{"id": "offer-001", "status": "APPROVED", "salary": {"amount": 12000, "currency": "CNY"}, "application_id": "app-001", "offer_id": "offer-001", "offer_status": "APPROVED", "salary_amount": 12000, "salary_currency": "CNY", "target_bonus": None}]


@pytest.mark.asyncio
async def test_offer_adapter_normalizes_salary_and_target_bonus_from_actual_offer_shape(monkeypatch):
    async def offer_detail(_self, _application_id):
        return {
            "offer": {
                "id": "offer-001",
                "salary": {
                    "basic_salary": {"amount": 29800},
                    "currency": "CNY",
                    "customize_info_list": [
                        {"object_id": "6909390106738821390", "customize_value": "50000"},
                    ],
                },
            },
        }

    monkeypatch.setattr(FeishuRecruitClient, "get_offer_detail", offer_detail)
    result = await feishu_offer_detail_adapter(
        {"application_id": "app-001", "target_bonus_custom_field_ids": ["6909390106738821390"]},
        {"app_id": "id", "app_secret": "secret"},
        None,
    )

    assert result.status == "success"
    assert result.data[0]["salary_amount"] == 29800
    assert result.data[0]["target_bonus"] == 50000


@pytest.mark.asyncio
@pytest.mark.parametrize(("status_code", "expected_code"), [(403, "FORBIDDEN"), (429, "RATE_LIMITED")])
async def test_offer_detail_surfaces_permission_and_rate_limit(monkeypatch, status_code, expected_code):
    class ErrorClient(_FakeFeishuHttpClient):
        async def get(self, *_args, **_kwargs):
            return _FakeFeishuResponse({}, status_code=status_code)

    import httpx

    monkeypatch.setattr(httpx, "AsyncClient", ErrorClient)
    result = await feishu_offer_detail_adapter({"application_id": "app-001"}, {"app_id": "id", "app_secret": "secret"}, None)
    assert result.status == "failed"
    assert result.error_code == expected_code


def test_prebuilt_operations_have_a_stable_template_contract():
    assert all(operation["template_code"] and operation["path"] for operation in FEISHU_RECRUIT_OPERATIONS)


def test_candidate_and_job_operations_expose_pagination_contracts():
    list_operations = [item for item in FEISHU_RECRUIT_OPERATIONS if item["operation_code"] == "QUERY_LIST"]
    assert {item["object_code"] for item in list_operations} == {"CANDIDATE", "JOB"}
    for operation in list_operations:
        assert operation["input_schema"]["properties"]["page_size"]["maximum"] == 100
        assert "page_token" in operation["input_schema"]["properties"]


@pytest.mark.asyncio
async def test_offer_adapter_requires_manual_resolution_for_multiple_offers(monkeypatch):
    async def offer_detail(_self, _application_id):
        return {"offers": [{"id": "offer-1"}, {"id": "offer-2"}]}

    monkeypatch.setattr(FeishuRecruitClient, "get_offer_detail", offer_detail)
    result = await feishu_offer_detail_adapter({"application_id": "app-001"}, {"app_id": "id", "app_secret": "secret"}, None)

    assert result.status == "failed"
    assert result.error_code == "FAILED_AMBIGUOUS_OFFER"
    assert result.extra["offer_count"] == 2


@pytest.mark.asyncio
async def test_candidate_and_job_details_and_candidate_pagination_are_read_only(monkeypatch):
    async def candidate_detail(_self, candidate_id):
        return {"id": candidate_id, "name": "Candidate"}

    async def job_detail(_self, job_id):
        return {"id": job_id, "name": "Job"}

    async def candidate_list(_self, *, page_size, page_token):
        assert page_size == 25
        assert page_token == "next-page"
        return {"items": [{"id": "candidate-1"}], "page_token": "next-page-2", "has_more": True}

    monkeypatch.setattr(FeishuRecruitClient, "get_candidate_detail", candidate_detail)
    monkeypatch.setattr(FeishuRecruitClient, "get_job_detail", job_detail)
    monkeypatch.setattr(FeishuRecruitClient, "list_candidates", candidate_list)

    candidate = await feishu_recruit_candidate_adapter({"candidate_id": "candidate-1"}, {"app_id": "id", "app_secret": "secret"}, None)
    job = await feishu_recruit_job_adapter({"job_id": "job-1"}, {"app_id": "id", "app_secret": "secret"}, None)
    page = await feishu_recruit_candidate_list_adapter({"page_size": 25, "page_token": "next-page"}, {"app_id": "id", "app_secret": "secret"}, None)

    assert candidate.status == job.status == page.status == "success"
    assert candidate.data[0]["candidate_id"] == "candidate-1"
    assert job.data[0]["job_id"] == "job-1"
    assert page.extra == {"page_token": "next-page-2", "has_more": True}

@pytest.mark.asyncio
async def test_offer_adapter_normalizes_salary_plan(monkeypatch):
    async def offer_detail(_self, _application_id):
        return {"offer_status": 7, "salary_plan": {"basic_salary": "15000", "currency": "CNY"}}

    monkeypatch.setattr(FeishuRecruitClient, "get_offer_detail", offer_detail)
    result = await feishu_offer_detail_adapter({"application_id": "app-001"}, {"app_id": "id", "app_secret": "secret"}, None)

    assert result.status == "success"
    assert result.data[0]["salary_amount"] == 15000
    assert result.data[0]["salary_currency"] == "CNY"
@pytest.mark.asyncio
async def test_offer_adapter_normalizes_wrapped_offer_salary_plan(monkeypatch):
    async def offer_detail(_self, _application_id):
        return {"offer": {"offer_status": 7, "salary_plan": {"basic_salary": "15000", "currency": "CNY"}}}

    monkeypatch.setattr(FeishuRecruitClient, "get_offer_detail", offer_detail)
    result = await feishu_offer_detail_adapter({"application_id": "app-001"}, {"app_id": "id", "app_secret": "secret"}, None)

    assert result.status == "success"
    assert result.data[0]["offer_status"] == 7
    assert result.data[0]["salary_amount"] == 15000
    assert result.data[0]["salary_currency"] == "CNY"
@pytest.mark.asyncio
async def test_offer_adapter_extracts_amount_from_salary_plan_object(monkeypatch):
    async def offer_detail(_self, _application_id):
        return {"offer": {"salary_plan": {"basic_salary": {"amount": "0", "period": 2}, "currency": "CNY"}}}

    monkeypatch.setattr(FeishuRecruitClient, "get_offer_detail", offer_detail)
    result = await feishu_offer_detail_adapter({"application_id": "app-001"}, {"app_id": "id", "app_secret": "secret"}, None)

    assert result.status == "success"
    assert result.data[0]["salary_amount"] == "0"
@pytest.mark.asyncio
async def test_offer_adapter_extracts_amount_from_serialized_salary_plan_object(monkeypatch):
    async def offer_detail(_self, _application_id):
        return {"offer": {"salary_plan": {"basic_salary": "{\"amount\":\"0\",\"period\":2}", "currency": "CNY"}}}

    monkeypatch.setattr(FeishuRecruitClient, "get_offer_detail", offer_detail)
    result = await feishu_offer_detail_adapter({"application_id": "app-001"}, {"app_id": "id", "app_secret": "secret"}, None)

    assert result.status == "success"
    assert result.data[0]["salary_amount"] == "0"
@pytest.mark.asyncio
async def test_offer_adapter_extracts_target_bonus_from_configured_custom_field(monkeypatch):
    async def offer_detail(_self, _application_id):
        return {
            "offer": {
                "salary_plan": {
                    "basic_salary": {"amount": "26000", "period": 2},
                    "customize_info_list": [
                        {"object_id": "bonus-field", "customize_value": "50000"},
                    ],
                }
            }
        }

    monkeypatch.setattr(FeishuRecruitClient, "get_offer_detail", offer_detail)
    result = await feishu_offer_detail_adapter(
        {"application_id": "app-001", "target_bonus_custom_field_ids": ["bonus-field"]},
        {"app_id": "id", "app_secret": "secret"},
        None,
    )

    assert result.status == "success"
    assert str(result.data[0]["salary_amount"]) == "26000"
    assert result.data[0]["target_bonus"] == 50000
