"""test_ucp_events_auth — 触发器测试接口权限校验"""
import inspect
import pytest
from unittest.mock import AsyncMock, MagicMock


def _make_mock_db(trigger_or_none):
    """构造一个 mock AsyncSession，execute → scalar_one_or_none → trigger_or_none。"""
    mock_result = MagicMock()
    mock_result.scalar_one_or_none = MagicMock(return_value=trigger_or_none)
    mock_db = AsyncMock()
    mock_db.execute = AsyncMock(return_value=mock_result)
    return mock_db


class TestTriggerTestEndpointAuth:
    """验证 POST /triggers/{trigger_id}/test 使用 require_op("ucp.triggers", "V")。"""

    def test_route_uses_require_op_not_current_user(self):
        """路由函数签名中 _user 依赖为 require_op，非 current_user。"""
        from app.ucp.routers.events import test_trigger

        sig = inspect.signature(test_trigger)
        params = list(sig.parameters.values())

        user_param = next((p for p in params if p.name == "_user"), None)
        assert user_param is not None, "缺少 _user 参数"
        assert user_param.default is not inspect.Parameter.empty, "_user 应有 Depends 默认值"

        dep_repr = repr(user_param.default)
        assert "current_user" not in dep_repr, f"_user 依赖不应使用 current_user，实际: {dep_repr}"

        # require_op 返回闭包 dep，通过 __closure__ 检查捕获的 menu/op
        dep_fn = user_param.default.dependency
        closure_vars = {c.cell_contents for c in dep_fn.__closure__} if dep_fn.__closure__ else set()
        assert "ucp.triggers" in closure_vars, f"闭包应捕获 ucp.triggers，实际: {closure_vars}"
        assert "V" in closure_vars, f"闭包应捕获 V，实际: {closure_vars}"

    def test_require_op_denies_user_without_permission(self, monkeypatch):
        """无 ucp.triggers 权限时 require_op 抛出 403。"""
        from fastapi import HTTPException
        import app.ucp.routers.events as events_mod

        def _deny(menu, op):
            raise HTTPException(status_code=403, detail=f"Missing permission: {menu}:{op}")

        monkeypatch.setattr(events_mod, "require_op", _deny)

        with pytest.raises(HTTPException) as exc_info:
            events_mod.require_op("ucp.triggers", "V")
        assert exc_info.value.status_code == 403

    @pytest.mark.asyncio
    async def test_authorized_user_can_test_trigger(self, monkeypatch):
        """有 ucp.triggers 权限的用户可正常调用测试接口。"""
        from app.ucp.models import UcpEventTrigger
        from app.ucp.routers.events import test_trigger
        from app.users.models import User

        mock_trigger = MagicMock(spec=UcpEventTrigger)
        mock_trigger.trigger_code = "T001"
        mock_trigger.trigger_name = "Test Trigger"
        mock_trigger.event_types = "user.created,user.updated"
        mock_trigger.event_source = "HR"
        mock_trigger.filter_rule = {"department": "R&D"}
        mock_trigger.pipeline_code = "P001"

        mock_db = _make_mock_db(mock_trigger)
        mock_user = MagicMock(spec=User)
        mock_user.username = "test_user"

        import app.ucp.routers.events as events_mod
        monkeypatch.setattr(events_mod, "require_op", lambda menu, op: lambda: mock_user)

        payload = {"event_type": "user.created", "source": "HR", "payload": {"department": "R&D"}}
        result = await test_trigger(
            trigger_id="T001",
            payload=payload,
            db=mock_db,
            _user=mock_user,
        )
        assert result["matched"] is True
        assert result["trigger_code"] == "T001"
        assert result["pipeline_code"] == "P001"

    @pytest.mark.asyncio
    async def test_trigger_not_found_returns_404_with_permission(self, monkeypatch):
        """有权限但触发器不存在时返回 404。"""
        from fastapi import HTTPException
        from app.users.models import User

        mock_db = _make_mock_db(None)
        mock_user = MagicMock(spec=User)
        mock_user.username = "test_user"

        import app.ucp.routers.events as events_mod
        monkeypatch.setattr(events_mod, "require_op", lambda menu, op: lambda: mock_user)

        with pytest.raises(HTTPException) as exc_info:
            await events_mod.test_trigger(
                trigger_id="NONEXIST",
                payload={},
                db=mock_db,
                _user=mock_user,
            )
        assert exc_info.value.status_code == 404

    @pytest.mark.asyncio
    async def test_mock_mode_when_no_event_data_provided(self, monkeypatch):
        """不提供 event_type/source/payload 时 is_test_payload=true。"""
        from app.ucp.models import UcpEventTrigger
        from app.users.models import User

        mock_trigger = MagicMock(spec=UcpEventTrigger)
        mock_trigger.trigger_code = "MOCK_TRIG"
        mock_trigger.trigger_name = "Mock Trigger"
        mock_trigger.event_types = "any.event"
        mock_trigger.event_source = "ANY"
        mock_trigger.filter_rule = None
        mock_trigger.pipeline_code = "P_MOCK"

        mock_db = _make_mock_db(mock_trigger)
        mock_user = MagicMock(spec=User)
        mock_user.username = "test_user"

        import app.ucp.routers.events as events_mod
        monkeypatch.setattr(events_mod, "require_op", lambda menu, op: lambda: mock_user)

        result = await events_mod.test_trigger(
            trigger_id="MOCK_TRIG",
            payload={},
            db=mock_db,
            _user=mock_user,
        )
        assert result["is_test_payload"] is True
        assert result["matched"] is True
        assert result["pipeline_code"] == "P_MOCK"
