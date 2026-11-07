"""绩效 OKR 参考内容数据源（飞书 OKR v1）接入测试。

全部为纯单元测试：不连数据库、不触网。
"""
from unittest.mock import AsyncMock

import pytest

from tests.test_performance_projects import management_member_data as management_member_data

from app.core.config import settings
from app.integrations.feishu.feishu_client import FeishuClientError
from app.performance.okr_provider import (
    FeishuOkrProvider,
    OkrObjectiveView,
    OkrView,
    get_okr_provider,
    map_feishu_okr,
    map_feishu_okrs,
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
@pytest.mark.parametrize("method", ["fetch", "fetch_all"])
async def test_contact_permission_denial_never_falls_back_to_another_identity(monkeypatch, method):
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
    assert await getattr(FeishuOkrProvider(client), method)(Db(), "434") == (None if method == "fetch" else [])
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
@pytest.mark.parametrize("switched", [False, True])
async def test_roster_to_real_client_contact_and_okr_endpoints(monkeypatch, switched):
    import httpx
    import contextlib
    from types import SimpleNamespace
    from sqlalchemy import Column, MetaData, String, Table
    from app.performance import okr_provider
    from app.integrations.feishu.feishu_client import FeishuClient, authorized_okr_read
    from app.identity_switch.service import SwitchCall, current_switch
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
    if switched:
        token = current_switch.set(SwitchCall("session", 7, "REVIEWER", "request", "/performance/okr/tasks/17/okr"))
        scope = authorized_okr_read("434", SimpleNamespace(switch_session_id="session", operator_user_id=7, effective_employee_no="REVIEWER"))
    else:
        token = None
        scope = contextlib.nullcontext()
    try:
        with scope:
            view = await FeishuOkrProvider(FeishuClient("same-app", "secret"), ["period-1"]).fetch(Db(), "434")
    finally:
        if token is not None: current_switch.reset(token)
    assert view.objectives[0].content == "提升交付效率"
    assert len(requests) == 3


@pytest.mark.asyncio
async def test_authorized_switch_okr_read_is_scoped_and_resets(monkeypatch):
    import httpx
    from types import SimpleNamespace
    from app.identity_switch.service import SwitchCall, current_switch
    from app.integrations.feishu.feishu_client import FeishuClient, authorized_okr_read, bind_okr_open_id, validate_okr_employee
    call = SwitchCall("session", 7, "REVIEWER", "request", "/performance/okr/tasks/17/okr")
    context = SimpleNamespace(switch_session_id="session", operator_user_id=7, effective_employee_no="REVIEWER")
    client = FeishuClient("app", "secret")
    monkeypatch.setattr(client, "_ensure_token", AsyncMock(return_value="token"))
    requests = []
    def handle(request):
        requests.append(request)
        return httpx.Response(200, json={"code": 0, "data": {"user_list": [{"user_id": "ou_target"}]}})
    original = httpx.AsyncClient
    monkeypatch.setattr(httpx, "AsyncClient", lambda **kwargs: original(transport=httpx.MockTransport(handle), **kwargs))
    token = current_switch.set(call)
    try:
        with authorized_okr_read("TARGET", context):
            validate_okr_employee("TARGET")
            with pytest.raises(FeishuClientError): validate_okr_employee("OTHER")
            await client.resolve_user_ids({"emails": ["target@example.com"]})
            bind_okr_open_id("TARGET", "ou_target")
            await client.get_json("/okr/v1/users/ou_target/okrs", {"user_id_type": "open_id"})
            for path in ["/contact/v3/users/ou_target", "/okr/v1/users/ou_other/okrs", "/okr/v1/users/ou_target/okrs?extra=1"]:
                with pytest.raises(FeishuClientError): await client.get_json(path, {"user_id_type": "open_id"})
            with pytest.raises(FeishuClientError): await client.send_text_to_user("ou_target", "blocked")
        with pytest.raises(FeishuClientError): await client.resolve_user_ids({})
        with pytest.raises(FeishuClientError): await client.get_json("/okr/v1/users/ou_target/okrs", {"user_id_type": "open_id"})
        with pytest.raises(FeishuClientError):
            with authorized_okr_read("TARGET", SimpleNamespace(switch_session_id="wrong")): pass
        assert len(requests) == 2
    finally:
        current_switch.reset(token)


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


def _period_payload(start, count, total=None):
    data = {"okr_list": [
        {**OKR_PAYLOAD["data"]["okr_list"][0], "id": f"okr-{i}", "period_id": f"period-{i}", "name": f"周期 {i}"}
        for i in range(start, start + count)
    ]}
    if total is not None:
        data["total"] = total
    return {"code": 0, "data": data}


def test_maps_every_period_and_keeps_legacy_first_period():
    payload = _period_payload(0, 3, 3)
    views = map_feishu_okrs(payload)
    assert [view.period_id for view in views] == ["period-0", "period-1", "period-2"]
    assert all(view.objectives[0].key_results[1].percent == 33.3 for view in views)
    assert map_feishu_okr(payload) == views[0]
    assert map_feishu_okrs({}) == []


@pytest.mark.asyncio
async def test_fetch_all_paginates_52_periods_and_resolves_identity_once():
    client = _StubFeishuClient()
    async def page(path, params):
        client.calls.append((path, dict(params)))
        offset = int(params["offset"])
        return _period_payload(offset, min(10, 52 - offset), 52)
    client.get_json = page
    provider = FeishuOkrProvider(client, ["configured-period"])
    provider.resolve_open_id = AsyncMock(return_value="ou_same/app")
    views = await provider.fetch_all(None, "E001")
    assert len(views) == 52
    assert [view.period_id for view in views] == [f"period-{i}" for i in range(52)]
    assert [params["offset"] for _, params in client.calls] == ["0", "10", "20", "30", "40", "50"]
    assert all(path == "/okr/v1/users/ou_same%2Fapp/okrs" for path, _ in client.calls)
    assert all(params == {"user_id_type": "open_id", "offset": str(i * 10), "limit": "10", "lang": "zh_cn", "period_ids": ["configured-period"]} for i, (_, params) in enumerate(client.calls))
    provider.resolve_open_id.assert_awaited_once_with(None, "E001")


@pytest.mark.asyncio
@pytest.mark.parametrize("pages,expected", [
    ([_period_payload(0, 0, 0)], 0),
    ([_period_payload(0, 2, 52), _period_payload(2, 0, 52)], 0),
    ([_period_payload(0, 10), _period_payload(10, 2)], 12),
    ([_period_payload(0, 2, 12), _period_payload(2, 10, 12)], 12),
    ([_period_payload(0, 10), _period_payload(0, 10)], 0),
])
async def test_fetch_all_stops_on_empty_short_or_repeated_page(pages, expected):
    client = _StubFeishuClient()
    client.get_json = AsyncMock(side_effect=pages)
    assert len(await _BoundProvider(client, "ou_same").fetch_all(None, "E001")) == expected
    assert client.get_json.await_count == len(pages)


@pytest.mark.asyncio
async def test_fetch_all_never_returns_partial_periods_on_later_page_error():
    client = _StubFeishuClient()
    client.get_json = AsyncMock(side_effect=[_period_payload(0, 10, 52), FeishuClientError("denied", 99991672)])
    assert await _BoundProvider(client, "ou_same").fetch_all(None, "E001") == []
    assert client.get_json.await_count == 2


@pytest.mark.asyncio
async def test_legacy_fetch_only_requests_first_page():
    client = _StubFeishuClient(payload=_period_payload(0, 10, 52))
    result = await _BoundProvider(client, "ou_same").fetch(None, "E001")
    assert result.period_id == "period-0"
    assert len(client.calls) == 1


@pytest.mark.asyncio
async def test_fetch_all_skips_missing_identity_and_disabled_provider(monkeypatch):
    from app.performance import okr_provider
    client = _StubFeishuClient(payload=OKR_PAYLOAD)
    assert await _BoundProvider(client, None).fetch_all(None, "E001") == []
    assert client.calls == []
    monkeypatch.setattr(okr_provider, "get_okr_provider", lambda: None)
    assert await okr_provider.fetch_employee_okrs(None, "E001") == []


@pytest.mark.asyncio
async def test_all_period_wrapper_uses_fetch_all_and_degrades_on_exception(monkeypatch):
    from types import SimpleNamespace
    from app.performance import okr_provider
    views = map_feishu_okrs(_period_payload(0, 2))
    fetch = AsyncMock(return_value=views)
    monkeypatch.setattr(okr_provider, "get_okr_provider", lambda: SimpleNamespace(fetch_all=fetch))
    assert await okr_provider.fetch_employee_okrs(None, "E001") == views
    fetch.assert_awaited_once_with(None, "E001")
    fetch.side_effect = RuntimeError("later page failed")
    assert await okr_provider.fetch_employee_okrs(None, "E001") == []


@pytest.fixture
def period_task_api(monkeypatch):
    from types import SimpleNamespace
    from app.performance import okr_router, projects_router
    task = SimpleNamespace(id=17, task_kind="evaluation", target_employee_no="E001")
    node = SimpleNamespace(node_type="evaluation", node_id="current")
    db = SimpleNamespace(get=AsyncMock(return_value=task))
    auth = AsyncMock(return_value=(task, node))
    template = AsyncMock(return_value={"content": [{"content_slot": "reference", "reference_kind": "more", "reference_value": "okr"}]})
    policy = AsyncMock(return_value=True)
    views = map_feishu_okrs(_period_payload(0, 2))
    single = AsyncMock(return_value=views[0])
    all_periods = AsyncMock(return_value=views)
    monkeypatch.setattr(projects_router, "_self_summary_task", auth)
    monkeypatch.setattr(projects_router, "_self_summary_template", template)
    monkeypatch.setattr(okr_router, "task_okr_access_allowed", policy)
    monkeypatch.setattr(okr_router, "get_okr_provider", lambda: SimpleNamespace(name="feishu"))
    monkeypatch.setattr(okr_router, "fetch_employee_okr", single)
    monkeypatch.setattr(okr_router, "fetch_employee_okrs", all_periods)
    return SimpleNamespace(route=okr_router.get_task_okr, db=db, auth=auth, template=template, policy=policy, single=single, all_periods=all_periods, views=views)


@pytest.mark.asyncio
async def test_switched_task_okr_permission_scope_begins_only_after_authorization(period_task_api):
    from types import SimpleNamespace
    from app.identity_switch.service import SwitchCall, current_switch
    from app.integrations.feishu.feishu_client import validate_okr_employee
    data = period_task_api
    async def fetched(db, employee_no):
        validate_okr_employee(employee_no)
        return data.views
    data.all_periods.side_effect = fetched
    handle = current_switch.set(SwitchCall("session", 7, "REVIEWER", "request", "/performance/okr/tasks/17/okr"))
    context = SimpleNamespace(switch_session_id="session", operator_user_id=7, effective_employee_no="REVIEWER")
    try:
        result = await data.route(17, context=context, db=data.db, include_periods=True)
        assert result.okrs == data.views
        with pytest.raises(FeishuClientError): validate_okr_employee("E001")
        data.auth.side_effect = __import__("fastapi").HTTPException(404, "TASK_NOT_FOUND")
        data.all_periods.reset_mock()
        with pytest.raises(__import__("fastapi").HTTPException): await data.route(17, context=context, db=data.db, include_periods=True)
        data.all_periods.assert_not_awaited()
    finally:
        current_switch.reset(handle)


@pytest.mark.asyncio
async def test_period_api_default_and_opt_in_response_contract(period_task_api):
    data = period_task_api
    legacy = await data.route(17, context=object(), db=data.db)
    assert legacy.okr == data.views[0] and legacy.okrs == []
    data.single.assert_awaited_once_with(data.db, "E001")
    data.all_periods.assert_not_awaited()
    result = await data.route(17, context=object(), db=data.db, include_periods=True)
    assert result.okr == data.views[0] and result.okrs == data.views
    assert result.employee_no == "E001" and result.enabled and result.source == "feishu"
    data.all_periods.assert_awaited_once_with(data.db, "E001")
    assert data.auth.await_count == data.policy.await_count == 2


@pytest.mark.asyncio
@pytest.mark.parametrize("reason", ["missing", "unauthorized", "unconfigured", "policy"])
async def test_period_api_denies_before_accessing_provider(period_task_api, monkeypatch, reason):
    from fastapi import HTTPException
    from app.performance import okr_router
    data = period_task_api
    provider = AsyncMock()
    monkeypatch.setattr(okr_router, "get_okr_provider", provider)
    if reason == "missing":
        data.db.get.return_value = None
    elif reason == "unauthorized":
        data.auth.side_effect = HTTPException(404, "TASK_NOT_FOUND")
    elif reason == "unconfigured":
        data.template.return_value = {"content": []}
    else:
        data.policy.return_value = False
    with pytest.raises(HTTPException) as error:
        await data.route(17, context=object(), db=data.db, include_periods=True)
    assert error.value.status_code == (403 if reason == "policy" else 404)
    provider.assert_not_called()
    data.single.assert_not_awaited()
    data.all_periods.assert_not_awaited()


@pytest.mark.asyncio
async def test_period_api_empty_and_disabled_responses(period_task_api, monkeypatch):
    from app.performance import okr_router
    data = period_task_api
    data.all_periods.return_value = []
    result = await data.route(17, context=object(), db=data.db, include_periods=True)
    assert result.enabled and result.okr is None and result.okrs == []
    data.all_periods.reset_mock()
    monkeypatch.setattr(okr_router, "get_okr_provider", lambda: None)
    result = await data.route(17, context=object(), db=data.db, include_periods=True)
    assert not result.enabled and result.okr is None and result.okrs == []
    data.all_periods.assert_not_awaited()


@pytest.mark.asyncio
@pytest.mark.parametrize("period_count", [0, 2])
async def test_management_detail_loads_all_periods_only_when_configured(management_member_data, monkeypatch, period_count):
    from tests.test_performance_projects import context
    from app.performance import okr_provider
    data = management_member_data
    views = map_feishu_okrs(_period_payload(0, period_count))
    fetch = AsyncMock(return_value=views)
    monkeypatch.setattr(okr_provider, "fetch_employee_okrs", fetch)
    await data.routes._project_member_detail(data.project, "E1", context(), data.db, 1)
    fetch.assert_not_awaited()
    data.nodes[-1].config["template"]["content"].append({"content_slot": "reference", "reference_kind": "more", "reference_value": "okr"})
    detail = await data.routes._project_member_detail(data.project, "E1", context(), data.db, 1)
    fetch.assert_awaited_once_with(data.db, "E1")
    tab = detail["management_tabs"][-1]
    assert tab["kind"] == "okr" and tab["task_id"] is None
    assert tab["okr"] == (views[0] if views else None) and tab["okrs"] == views
    assert tab["status"] == ("completed" if views else "not_started")


@pytest.mark.asyncio
@pytest.mark.parametrize("reason", ["forbidden", "outside_scope", "foreign_root"])
async def test_management_okr_denies_before_external_fetch(management_member_data, monkeypatch, reason):
    from fastapi import HTTPException
    from tests.test_performance_projects import context
    from app.performance import okr_provider
    data = management_member_data
    fetch = AsyncMock()
    monkeypatch.setattr(okr_provider, "fetch_employee_okrs", fetch)
    data.nodes[-1].config["template"]["content"].append({"content_slot": "reference", "reference_kind": "more", "reference_value": "okr"})
    if reason == "forbidden":
        monkeypatch.setattr(data.routes, "_project_data_scope", AsyncMock(side_effect=HTTPException(403)))
    elif reason == "outside_scope":
        monkeypatch.setattr(data.routes, "_project_data_scope", AsyncMock(return_value={"E2"}))
    with pytest.raises(HTTPException):
        await data.routes._project_member_detail(data.project, "E1", context(), data.db, 999 if reason == "foreign_root" else 1)
    fetch.assert_not_awaited()
