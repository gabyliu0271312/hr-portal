"""GET /trees/cost-center/directory 受控成本中心目录：fail-closed 健康、include_inactive、权限声明。"""
from datetime import datetime, timezone
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.trees import router as trees_router


def _cc_node(id_, code, name, parent_id, level, is_active, path=None, synced_at=None, is_leaf=True):
    return SimpleNamespace(
        id=id_, code=code, name=name, parent_id=parent_id,
        level=level, is_leaf=is_leaf, is_active=is_active,
        path=path,
        synced_at=synced_at or datetime(2026, 11, 11, 8, 0, tzinfo=timezone.utc),
    )


def _healthy_rows():
    return [
        _cc_node(1, "C1", "一级成本中心A", None, 1, True, path="/一级成本中心A/"),
        _cc_node(2, "C1-1", "二级成本中心A1", 1, 2, True, path="/一级成本中心A/二级成本中心A1/"),
        _cc_node(3, "C1-1x", "停用成本中心A1x", 2, 3, False, path="/一级成本中心A/二级成本中心A1/停用成本中心A1x/"),
        _cc_node(4, "C2", "一级成本中心B", None, 1, True, path="/一级成本中心B/"),
    ]


class FakeResult:
    def __init__(self, rows=None):
        self.rows = list(rows or [])

    def all(self):
        return list(self.rows)

    def scalars(self):
        return self


class FakeSession:
    def __init__(self, rows):
        self.rows = list(rows)
        self.executed = []

    async def execute(self, statement, params=None):
        self.executed.append((statement, params))
        return FakeResult(self.rows)


ACTOR = SimpleNamespace(id=7, login_name="tester", is_active=True)


@pytest.mark.asyncio
async def test_cc_directory_returns_healthy_tree():
    db = FakeSession(_healthy_rows())
    out = await trees_router.get_cc_directory(
        include_inactive=False, _=ACTOR, db=db,
    )
    codes = {node.code for node in out}
    assert codes == {"C1", "C2"}
    c1 = next(node for node in out if node.code == "C1")
    assert [child.code for child in c1.children] == ["C1-1"]
    assert all(node.is_active for node in out)


@pytest.mark.asyncio
async def test_cc_directory_default_excludes_inactive():
    db = FakeSession(_healthy_rows())
    out = await trees_router.get_cc_directory(
        include_inactive=False, _=ACTOR, db=db,
    )
    text = repr(out)
    assert "A1x" not in text


@pytest.mark.asyncio
async def test_cc_directory_include_inactive():
    db = FakeSession(_healthy_rows())
    out = await trees_router.get_cc_directory(
        include_inactive=True, _=ACTOR, db=db,
    )
    text = repr(out)
    assert "A1x" in text


@pytest.mark.asyncio
async def test_cc_directory_exposes_synced_at():
    db = FakeSession(_healthy_rows())
    out = await trees_router.get_cc_directory(
        include_inactive=True, _=ACTOR, db=db,
    )
    assert out[0].synced_at is not None
    assert out[0].synced_at.endswith("+00:00") or out[0].synced_at.endswith("Z")


@pytest.mark.asyncio
async def test_cc_directory_fails_closed_on_cycle():
    rows = [
        _cc_node(1, "C1", "成本中心A", 2, 1, True),
        _cc_node(2, "C2", "成本中心B", 1, 1, True),
    ]
    db = FakeSession(rows)
    with pytest.raises(HTTPException) as exc_info:
        await trees_router.get_cc_directory(
            include_inactive=False, _=ACTOR, db=db,
        )
    assert exc_info.value.status_code == 409
    detail = exc_info.value.detail
    assert detail["code"] == "cost_center_tree_invalid"
    assert any(issue["code"] == "cycle" for issue in detail["issues"])


@pytest.mark.asyncio
async def test_cc_directory_fails_closed_on_missing_parent():
    rows = [
        _cc_node(1, "C1", "成本中心A", None, 1, True),
        _cc_node(2, "C1-1", "二级成本中心A1", 99, 2, True),
    ]
    db = FakeSession(rows)
    with pytest.raises(HTTPException) as exc_info:
        await trees_router.get_cc_directory(
            include_inactive=False, _=ACTOR, db=db,
        )
    assert exc_info.value.status_code == 409
    detail = exc_info.value.detail
    assert any(issue["code"] == "orphan_parent" for issue in detail["issues"])


def test_cc_directory_declares_people_cost_center_view_permission():
    """回归：目录端点必须通过 require_op('people.cost_center', 'V') 声明菜单查看权限。"""
    import inspect

    source = inspect.getsource(trees_router.get_cc_directory)
    assert "require_op(\"people.cost_center\", \"V\")" in source
    assert "analyze_tree" in source
