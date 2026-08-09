from types import SimpleNamespace

import pytest

from app.mapping.errors import MappingErrorCode, MappingException
from app.mapping.models import MappingBinding
from app.mapping import router as mapping_router


class _ScalarResult:
    def __init__(self, value):
        self.value = value

    def scalar_one_or_none(self):
        return self.value


class _BindingDb:
    def __init__(self, binding):
        self.binding = binding
        self.calls = 0

    async def execute(self, statement):
        self.calls += 1
        return _ScalarResult(self.binding)


@pytest.mark.asyncio
async def test_binding_authorization_uses_binding_caller_scope_for_view(monkeypatch):
    binding = MappingBinding(id=7, caller="push_target", asset_id="target-1", binding_key="default")
    db = _BindingDb(binding)
    checked = []

    async def allowed(user, session, scope, operation):
        checked.append((scope, operation))
        return True

    monkeypatch.setattr(mapping_router, "user_has_op", allowed)
    result = await mapping_router._authorize_binding_effect(
        db,
        SimpleNamespace(id=3),
        binding_id=7,
        caller=None,
        effect="view",
        operation="V",
    )

    assert result is binding
    assert checked == [("warehouse.service", "V")]
    assert db.calls == 1


@pytest.mark.asyncio
async def test_binding_authorization_rejects_caller_ownership_mismatch(monkeypatch):
    binding = MappingBinding(id=8, caller="workflow", asset_id="pipeline-1", binding_key="default")
    db = _BindingDb(binding)

    async def allowed(*args):
        return True

    monkeypatch.setattr(mapping_router, "user_has_op", allowed)
    with pytest.raises(MappingException) as exc_info:
        await mapping_router._authorize_binding_effect(
            db,
            SimpleNamespace(id=4),
            binding_id=8,
            caller="warehouse",
            effect="publish",
        )

    assert exc_info.value.code == MappingErrorCode.MAPPING_EFFECT_FORBIDDEN
    assert exc_info.value.http_status == 403


@pytest.mark.asyncio
async def test_caller_scope_denial_is_stable_403(monkeypatch):
    async def denied(user, session, scope, operation):
        assert scope == "ucp.pipelines"
        assert operation == "U"
        return False

    monkeypatch.setattr(mapping_router, "user_has_op", denied)
    with pytest.raises(MappingException) as exc_info:
        await mapping_router._require_scope(
            SimpleNamespace(id=5),
            object(),
            "ucp_transform",
            "U",
        )

    assert exc_info.value.code == MappingErrorCode.MAPPING_EFFECT_FORBIDDEN
    assert exc_info.value.http_status == 403
