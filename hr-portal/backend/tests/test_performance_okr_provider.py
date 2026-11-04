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
    assert objective.status == "normal"        # 数字码 "1" 归一化为枚举名
    assert [kr.content for kr in objective.key_results] == ["自动化覆盖率 60%", "平均交付周期 -20%"]
    assert [kr.weight for kr in objective.key_results] == [50.0, 50.0]   # 第二个 KR 回退 kr_weight
    assert [kr.status for kr in objective.key_results] == ["normal", "risk"]
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
