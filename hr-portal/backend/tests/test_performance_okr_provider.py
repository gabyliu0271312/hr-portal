"""绩效 OKR 参考内容数据源（飞书 OKR v1）接入测试。

全部为纯单元测试：不连数据库、不触网。
"""
import pytest

from app.core.config import settings
from app.integrations.feishu.feishu_client import FeishuClientError
from app.performance.okr_provider import (
    FeishuOkrProvider,
    OkrObjectiveView,
    OkrView,
    get_okr_provider,
    map_feishu_okr,
)


OKR_PAYLOAD = {
    "code": 0,
    "msg": "success",
    "data": {
        "total": 1,
        "okr_list": [
            {
                "id": "7072252816005349396",
                "period_id": "6990181559036610092",
                "name": "2026 年度 OKR",
                "objective_list": [
                    {
                        "id": "7073360513731690515",
                        "content": "提升交付效率",
                        "weight": 100,
                        "progress_rate": {"percent": 66.666, "status": "1"},
                        "kr_list": [
                            {"id": "kr-1", "content": "自动化覆盖率 60%", "weight": 50, "progress_rate": {"percent": 100, "status": "1"}},
                            {"id": "kr-2", "content": "平均交付周期 -20%", "kr_weight": 50, "progress_rate": {"percent": 33.3, "status": "2"}},
                        ],
                    }
                ],
            }
        ],
    },
}


class _StubFeishuClient:
    """记录调用参数的假客户端。"""

    def __init__(self, payload=None, error: FeishuClientError | None = None):
        self.payload = payload
        self.error = error
        self.calls: list[tuple[str, dict]] = []

    async def get_json(self, path: str, params: dict | None = None) -> dict:
        self.calls.append((path, dict(params or {})))
        if self.error is not None:
            raise self.error
        return self.payload or {}


@pytest.mark.asyncio
@pytest.mark.parametrize("identities,expected", [
    ([{"user_id": "ou_same", "email": "person@example.com"}, {"user_id": "ou_same", "mobile": "13800000000"}], "ou_same"),
    ([{"user_id": "ou_email"}], "ou_email"),
    ([{"user_id": "ou_mobile"}], "ou_mobile"),
    ([], None),
    ([{"user_id": "ou_a"}, {"user_id": "ou_b"}], None),
])
async def test_roster_identity_resolution_without_portal_account(monkeypatch, identities, expected):
    from types import SimpleNamespace
    from unittest.mock import AsyncMock
    from sqlalchemy import Column, MetaData, String, Table
    from app.performance import okr_provider
    table = Table("emp_realtime_roster", MetaData(), Column("employee_no", String), Column("corporate_email", String), Column("mobile_phone", String))
    monkeypatch.setattr(okr_provider, "employee_roster_table", lambda: table)
    client = SimpleNamespace(resolve_user_ids=AsyncMock(return_value={"code": 0, "data": {"user_list": identities}}))
    class Db:
        async def execute(self, query):
            assert query.compile().params["employee_no_1"] == "434"
            return SimpleNamespace(mappings=lambda: SimpleNamespace(one_or_none=lambda: {"corporate_email": "person@example.com", "mobile_phone": "13800000000"}))
    assert await FeishuOkrProvider(client).resolve_open_id(Db(), "434") == expected
    client.resolve_user_ids.assert_awaited_once_with({"emails": ["person@example.com"], "mobiles": ["13800000000"], "include_resigned": True})


@pytest.mark.asyncio
async def test_contact_permission_denial_never_falls_back_to_another_identity(monkeypatch):
    from types import SimpleNamespace
    from unittest.mock import AsyncMock
    from sqlalchemy import Column, MetaData, String, Table
    from app.performance import okr_provider
    table = Table("emp_realtime_roster", MetaData(), Column("employee_no", String), Column("corporate_email", String))
    monkeypatch.setattr(okr_provider, "employee_roster_table", lambda: table)
    client = SimpleNamespace(resolve_user_ids=AsyncMock(side_effect=FeishuClientError("denied", 99991672)), get_json=AsyncMock())
    class Db:
        async def execute(self, query):
            assert "performance_identity_links" not in str(query)
            return SimpleNamespace(mappings=lambda: SimpleNamespace(one_or_none=lambda: {"corporate_email": "person@example.com"}))
    assert await FeishuOkrProvider(client).fetch(Db(), "434") is None
    client.get_json.assert_not_awaited()


@pytest.mark.asyncio
async def test_empty_roster_identity_retains_existing_portal_binding(monkeypatch):
    from types import SimpleNamespace
    from unittest.mock import AsyncMock
    from app.performance import okr_provider
    from app.data.employee_roster_contract import EmployeeRosterContractError
    def missing(): raise EmployeeRosterContractError("not loaded")
    monkeypatch.setattr(okr_provider, "employee_roster_table", missing)
    client = SimpleNamespace(resolve_user_ids=AsyncMock())
    class Db:
        async def execute(self, query): return SimpleNamespace(scalar_one_or_none=lambda: "ou_bound")
    assert await FeishuOkrProvider(client).resolve_open_id(Db(), "434") == "ou_bound"
    client.resolve_user_ids.assert_not_awaited()


@pytest.mark.asyncio
async def test_roster_to_real_client_contact_and_okr_endpoints(monkeypatch):
    import httpx
    from types import SimpleNamespace
    from sqlalchemy import Column, MetaData, String, Table
    from app.performance import okr_provider
    from app.integrations.feishu.feishu_client import FeishuClient
    table = Table("emp_realtime_roster", MetaData(), Column("employee_no", String), Column("corporate_email", String), Column("mobile_phone", String))
    monkeypatch.setattr(okr_provider, "employee_roster_table", lambda: table)
    monkeypatch.setattr(settings, "FEISHU_NOTIFICATION_DELIVERY_ENABLED", False)
    requests = []
    def handle(request):
        import json
        requests.append(request)
        if "/auth/v3/" in request.url.path:
            assert json.loads(request.content) == {"app_id": "same-app", "app_secret": "secret"}
            return httpx.Response(200, json={"code": 0, "tenant_access_token": "test-token", "expire": 7200})
        assert request.headers["Authorization"] == "Bearer test-token"
        if request.url.path.endswith("batch_get_id"):
            assert request.url.params["user_id_type"] == "open_id"
            assert json.loads(request.content) == {"emails": ["person@example.com"], "mobiles": ["13800000000"], "include_resigned": True}
            return httpx.Response(200, json={"code": 0, "data": {"user_list": [{"user_id": "ou_current_app"}]}})
        assert request.url.path.endswith("/users/ou_current_app/okrs")
        assert request.url.params["period_ids"] == "period-1"
        return httpx.Response(200, json=OKR_PAYLOAD)
    original = httpx.AsyncClient
    monkeypatch.setattr(httpx, "AsyncClient", lambda **kwargs: original(transport=httpx.MockTransport(handle), **kwargs))
    class Db:
        async def execute(self, query): return SimpleNamespace(mappings=lambda: SimpleNamespace(one_or_none=lambda: {"corporate_email": "person@example.com", "mobile_phone": "13800000000"}))
    view = await FeishuOkrProvider(FeishuClient("same-app", "secret"), ["period-1"]).fetch(Db(), "434")
    assert view.objectives[0].content == "提升交付效率"
    assert len(requests) == 3


@pytest.mark.asyncio
async def test_contact_resolution_does_not_bypass_identity_switch(monkeypatch):
    from types import SimpleNamespace
    from unittest.mock import AsyncMock
    from app.identity_switch.service import current_switch
    from app.integrations.feishu.feishu_client import FeishuClient
    client = FeishuClient("app", "secret")
    token_fetch = AsyncMock()
    monkeypatch.setattr(client, "_ensure_token", token_fetch)
    handle = current_switch.set(SimpleNamespace())
    try:
        with pytest.raises(FeishuClientError): await client.resolve_user_ids({"emails": ["person@example.com"]})
        token_fetch.assert_not_awaited()
    finally:
        current_switch.reset(handle)


def test_official_okr_progress_and_current_kr_weight():
    import copy
    payload = copy.deepcopy(OKR_PAYLOAD)
    kr = payload["data"]["okr_list"][0]["objective_list"][0]["kr_list"][0]
    kr.update(weight=0, kr_weight=75, progress_rate={"status": "0", "percent": 10})
    mapped = map_feishu_okr(payload)
    assert mapped.objectives[0].key_results[0].weight == 75
    assert mapped.objectives[0].key_results[0].status == "normal"


class _BoundProvider(FeishuOkrProvider):
    """绕过数据库身份查询的 provider。"""

    def __init__(self, client, open_id: str | None):
        super().__init__(client=client)
        self._open_id = open_id

    async def resolve_open_id(self, db, employee_no: str) -> str | None:  # noqa: ANN001
        return self._open_id


def test_map_feishu_okr_normalizes_objectives_and_krs():
    view = map_feishu_okr(OKR_PAYLOAD)

    assert isinstance(view, OkrView)
    assert view.source == "feishu"
    assert view.period_label == "2026 年度 OKR"
    assert view.period_id == "6990181559036610092"
    assert len(view.objectives) == 1

    objective = view.objectives[0]
    assert isinstance(objective, OkrObjectiveView)
    assert objective.content == "提升交付效率"
    assert objective.percent == 66.67          # 两位小数
    assert objective.status == "risk"
    assert [kr.content for kr in objective.key_results] == ["自动化覆盖率 60%", "平均交付周期 -20%"]
    assert [kr.weight for kr in objective.key_results] == [50.0, 50.0]
    assert [kr.status for kr in objective.key_results] == ["risk", "extended"]
    assert [kr.percent for kr in objective.key_results] == [100.0, 33.3]


@pytest.mark.parametrize(
    "payload",
    [
        {},
        {"code": 0, "data": None},
        {"code": 0, "data": {"okr_list": []}},
        {"code": 0, "data": {"total": 0}},
        {"code": 1001004, "msg": "OKR data not found"},
    ],
)
def test_map_feishu_okr_returns_none_without_data(payload):
    assert map_feishu_okr(payload) is None


def test_map_feishu_okr_tolerates_missing_progress_and_kr_list():
    view = map_feishu_okr({"code": 0, "data": {"okr_list": [{"id": "1", "objective_list": [{"id": "o", "content": "O"}]}]}})

    assert view is not None
    assert view.period_label == ""
    objective = view.objectives[0]
    assert objective.percent is None
    assert objective.status is None
    assert objective.key_results == []


def test_get_okr_provider_respects_settings(monkeypatch):
    monkeypatch.setattr(settings, "PERFORMANCE_OKR_PROVIDER", "none")
    assert get_okr_provider() is None

    monkeypatch.setattr(settings, "PERFORMANCE_OKR_PROVIDER", "feishu")
    provider = get_okr_provider()
    assert isinstance(provider, FeishuOkrProvider)

    monkeypatch.setattr(settings, "PERFORMANCE_OKR_PROVIDER", "unknown-source")
    assert get_okr_provider() is None


@pytest.mark.asyncio
async def test_provider_skips_when_employee_has_no_feishu_identity():
    client = _StubFeishuClient(payload=OKR_PAYLOAD)
    provider = _BoundProvider(client, open_id=None)

    assert await provider.fetch(None, "E001") is None
    assert client.calls == []          # 未绑定身份时不应发起任何请求


@pytest.mark.asyncio
async def test_provider_fetches_okr_by_open_id():
    client = _StubFeishuClient(payload=OKR_PAYLOAD)
    provider = _BoundProvider(client, open_id="ou_abc123")

    view = await provider.fetch(None, "E001")

    assert view is not None
    assert view.objectives[0].content == "提升交付效率"
    path, params = client.calls[0]
    assert path == "/okr/v1/users/ou_abc123/okrs"
    assert params["user_id_type"] == "open_id"
    assert params["lang"] == "zh_cn"


@pytest.mark.asyncio
async def test_provider_degrades_to_empty_state_on_feishu_error():
    client = _StubFeishuClient(error=FeishuClientError("无权限", code=1001002))
    provider = _BoundProvider(client, open_id="ou_abc123")

    # 参考内容是旁路信息：接口报错按空态降级，不能抛出阻塞填写页
    assert await provider.fetch(None, "E001") is None


@pytest.mark.asyncio
async def test_task_reference_declares_okr_without_fetching_external_data(monkeypatch):
    from types import SimpleNamespace
    import app.performance.projects_router as projects_router

    async def template(*args):
        return {"content": [{"content_slot": "reference", "reference_kind": "more", "reference_value": "okr", "name": "OKR", "reference_settings": {"page_name": "我的 OKR"}}]}

    monkeypatch.setattr(projects_router, "_self_summary_template", template)
    task = SimpleNamespace(id=17, target_employee_no="E001")
    tabs = await projects_router._reference_tabs(task, SimpleNamespace(node_id="current"), None, "ACTOR", None)
    assert len(tabs) == 1
    assert tabs[0]["kind"] == "okr"
    assert tabs[0]["task_id"] == 17
    assert tabs[0]["node_name"] == "我的 OKR"
    assert tabs[0]["okr"] is None


@pytest.mark.asyncio
async def test_task_okr_api_requires_authorized_task_and_configured_reference(monkeypatch):
    from types import SimpleNamespace
    from fastapi import HTTPException
    from app.performance import okr_router, projects_router

    class Db:
        async def get(self, model, task_id):
            return SimpleNamespace(id=task_id, task_kind="evaluation", target_employee_no="E001") if task_id == 17 else None

    async def allowed(*args, **kwargs):
        return SimpleNamespace(id=17, task_kind="evaluation", target_employee_no="E001"), SimpleNamespace(node_id="current")

    async def configured(*args):
        return {"content": [{"content_slot": "reference", "reference_kind": "more", "reference_value": "okr"}]}

    async def denied(*args, **kwargs):
        raise HTTPException(status_code=404, detail="TASK_NOT_FOUND")

    async def fetched(db, employee_no):
        assert employee_no == "E001"
        return map_feishu_okr(OKR_PAYLOAD)

    monkeypatch.setattr(projects_router, "_self_summary_task", allowed)
    monkeypatch.setattr(projects_router, "_self_summary_template", configured)
    monkeypatch.setattr(okr_router, "get_okr_provider", lambda: SimpleNamespace(name="feishu"))
    monkeypatch.setattr(okr_router, "fetch_employee_okr", fetched)
    result = await okr_router.get_task_okr(17, context=object(), db=Db())
    assert result.okr.objectives[0].content == "提升交付效率"
    assert result.employee_no == "E001"

    monkeypatch.setattr(projects_router, "_self_summary_task", denied)
    with pytest.raises(HTTPException) as exc:
        await okr_router.get_task_okr(17, context=object(), db=Db())
    assert exc.value.status_code == 404

    monkeypatch.setattr(projects_router, "_self_summary_task", allowed)
    async def no_reference(*args):
        return {"content": []}
    monkeypatch.setattr(projects_router, "_self_summary_template", no_reference)
    with pytest.raises(HTTPException) as exc:
        await okr_router.get_task_okr(17, context=object(), db=Db())
    assert exc.value.status_code == 404


@pytest.mark.asyncio
@pytest.mark.parametrize("allowed,legacy,ids", [(True, False, [17]), (False, False, [17]), (True, True, [17]), (True, True, [17, 18])])
async def test_voluntary_okr_uses_current_setting_and_exact_task(allowed, legacy, ids):
    from types import SimpleNamespace
    from app.performance.okr_policy import task_okr_access_allowed
    from app.performance.models import PerformanceAuditEvent, PerformanceNodeTask
    task = SimpleNamespace(id=17, project_id=8, cycle_ref="C", node_snapshot_id=2, target_employee_no="E", handler_ref="R")
    node = SimpleNamespace(id=2, node_id="later", node_type="evaluation", node_order=2, config={"template": {"executor_role_code": "assessment.reviewer_360"}})
    first = SimpleNamespace(id=1, node_id="first", node_type="evaluation", node_order=1, config=node.config)
    project = SimpleNamespace(id=8, settings={"flow_settings": {"node_settings": {"first": {"invite": {"allow_voluntary_okr_access": allowed}}}}})
    event = SimpleNamespace(after_state={"project_id": 8, "node_id": "later", **({} if legacy else {"task_id": 17})})
    class Db:
        async def execute(self, query):
            entity = query.column_descriptions[0].get("entity")
            values = [event] if entity is PerformanceAuditEvent else ids if entity is PerformanceNodeTask else [first, node]
            return SimpleNamespace(scalars=lambda: SimpleNamespace(all=lambda: values))
    assert await task_okr_access_allowed(Db(), task, node, project) is (allowed and (not legacy or ids == [17]))


@pytest.mark.asyncio
@pytest.mark.parametrize("audit_task,audit_project,audit_node", [(18, 8, "later"), (17, 9, "later"), (17, 8, "other")])
async def test_unrelated_voluntary_audit_does_not_restrict_invited_task(audit_task, audit_project, audit_node):
    from types import SimpleNamespace
    from app.performance.okr_policy import task_okr_access_allowed
    task = SimpleNamespace(id=17, project_id=8, cycle_ref="C", target_employee_no="E", handler_ref="R")
    node = SimpleNamespace(node_id="later", config={"template": {"executor_role_code": "assessment.reviewer_360"}})
    event = SimpleNamespace(after_state={"project_id": audit_project, "node_id": audit_node, "task_id": audit_task})
    class Db:
        async def execute(self, query):
            return SimpleNamespace(scalars=lambda: SimpleNamespace(all=lambda: [event]))
    assert await task_okr_access_allowed(Db(), task, node, SimpleNamespace(id=8)) is True


@pytest.mark.asyncio
async def test_summary_default_okr_and_policy_denial_precedes_provider(monkeypatch):
    from types import SimpleNamespace
    from unittest.mock import AsyncMock
    from fastapi import HTTPException
    from app.performance import okr_router, projects_router
    task = SimpleNamespace(id=17, task_kind="work_summary", target_employee_no="E")
    class Db:
        async def get(self, model, key): return task
    monkeypatch.setattr(projects_router, "_self_summary_task", AsyncMock(return_value=(task, SimpleNamespace(node_type="work_summary"))))
    monkeypatch.setattr(projects_router, "_self_summary_template", AsyncMock(return_value={"content": []}))
    policy = AsyncMock(return_value=True)
    fetched = AsyncMock(return_value=None)
    monkeypatch.setattr(okr_router, "task_okr_access_allowed", policy)
    monkeypatch.setattr(okr_router, "get_okr_provider", lambda: SimpleNamespace(name="feishu"))
    monkeypatch.setattr(okr_router, "fetch_employee_okr", fetched)
    assert (await okr_router.get_task_okr(17, context=object(), db=Db())).enabled is True
    fetched.assert_awaited_once()
    fetched.reset_mock()
    policy.return_value = False
    with pytest.raises(HTTPException) as exc:
        await okr_router.get_task_okr(17, context=object(), db=Db())
    assert (exc.value.status_code, exc.value.detail) == (403, "OKR_REFERENCE_FORBIDDEN")
    fetched.assert_not_awaited()


def test_project_voluntary_okr_setting_roundtrip_default_and_validation():
    from app.performance.project_service import PerformanceProjectService, ProjectValidationError
    validate = PerformanceProjectService._validate_flow_settings
    def flow(invite): return {"node_settings": {"feedback": {"invite": invite}}, "node_times": {}}
    assert validate(flow({}))["node_settings"]["feedback"]["invite"]["allow_voluntary_okr_access"] is False
    saved = validate(flow({"allow_voluntary_evaluation": True, "allow_voluntary_okr_access": True}))
    assert validate(saved) == saved
    assert validate(flow({"allow_voluntary_evaluation": False}), saved)["node_settings"]["feedback"]["invite"]["allow_voluntary_okr_access"] is True
    for value in ["false", 1, None]:
        with pytest.raises(ProjectValidationError): validate(flow({"allow_voluntary_okr_access": value}))
