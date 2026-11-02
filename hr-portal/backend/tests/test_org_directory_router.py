"""GET /trees/org/directory 受控组织目录：fail-closed 健康、include_inactive、权限声明。"""
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.trees import router as trees_router


def _org_node(id_, code, name, parent_id, level, is_active, is_leaf=True):
    return SimpleNamespace(
        id=id_, code=code, name=name, parent_id=parent_id,
        level=level, is_leaf=is_leaf, is_active=is_active,
    )


def _healthy_rows():
    return [
        _org_node(1, "RootOrg", "创梦天地", None, 0, True),
        _org_node(2, "A", "一级组织A", 1, 1, True),
        _org_node(3, "A1", "二级组织A1", 2, 2, True),
        _org_node(4, "A1x", "停用组织A1x", 3, 3, False),
        _org_node(5, "B", "一级组织B", 1, 1, True),
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
async def test_org_directory_returns_healthy_tree():
    db = FakeSession(_healthy_rows())
    out = await trees_router.get_org_directory(
        include_inactive=False, _=ACTOR, db=db,
    )
    codes = {node.code for node in out}
    assert "RootOrg" not in codes
    assert "A" in codes and "B" in codes
    a = next(node for node in out if node.code == "A")
    assert [child.code for child in a.children] == ["A1"]
    assert a.children[0].is_active is True
    assert all(node.is_active for node in a.children)


@pytest.mark.asyncio
async def test_org_directory_default_excludes_inactive():
    db = FakeSession(_healthy_rows())
    out = await trees_router.get_org_directory(
        include_inactive=False, _=ACTOR, db=db,
    )
    text = repr(out)
    assert "A1x" not in text


@pytest.mark.asyncio
async def test_org_directory_include_inactive():
    db = FakeSession(_healthy_rows())
    out = await trees_router.get_org_directory(
        include_inactive=True, _=ACTOR, db=db,
    )
    text = repr(out)
    assert "A1x" in text


@pytest.mark.asyncio
async def test_org_directory_fails_closed_on_cycle():
    rows = [
        _org_node(1, "RootOrg", "创梦天地", None, 0, True),
        _org_node(2, "A", "一级组织A", 3, 1, True),
        _org_node(3, "B", "一级组织B", 2, 1, True),
    ]
    db = FakeSession(rows)
    with pytest.raises(HTTPException) as exc_info:
        await trees_router.get_org_directory(
            include_inactive=False, _=ACTOR, db=db,
        )
    assert exc_info.value.status_code == 409
    detail = exc_info.value.detail
    assert detail["code"] == "org_hierarchy_invalid"
    assert any(issue["code"] == "org_tree_cycle" for issue in detail["issues"])


@pytest.mark.asyncio
async def test_org_directory_fails_closed_on_missing_parent():
    rows = [
        _org_node(1, "RootOrg", "创梦天地", None, 0, True),
        _org_node(2, "A", "一级组织A", 99, 1, True),
    ]
    db = FakeSession(rows)
    with pytest.raises(HTTPException) as exc_info:
        await trees_router.get_org_directory(
            include_inactive=False, _=ACTOR, db=db,
        )
    assert exc_info.value.status_code == 409
    detail = exc_info.value.detail
    assert any(issue["code"] == "org_tree_parent_missing" for issue in detail["issues"])


@pytest.mark.asyncio
async def test_org_directory_does_not_silently_attach_orphan():
    """孤儿节点（父是业务节点但父不在投影）不得被 _build_tree 提升为根。"""
    rows = [
        _org_node(1, "RootOrg", "创梦天地", None, 0, True),
        _org_node(2, "A", "一级组织A", 1, 1, True),
        _org_node(3, "A1", "二级组织A1", 2, 2, True),
        _org_node(4, "Ghost", "孤儿组织", 999, 1, True),
    ]
    db = FakeSession(rows)
    with pytest.raises(HTTPException) as exc_info:
        await trees_router.get_org_directory(
            include_inactive=False, _=ACTOR, db=db,
        )
    assert exc_info.value.status_code == 409
    detail = exc_info.value.detail
    assert any(issue["code"] == "org_tree_parent_missing" for issue in detail["issues"])


def test_org_directory_declares_people_organization_view_permission():
    """回归：目录端点必须通过 require_op('people.organization', 'V') 声明菜单查看权限。"""
    import inspect

    source = inspect.getsource(trees_router.get_org_directory)
    assert "require_op(\"people.organization\", \"V\")" in source
    assert "resolve_org_hierarchy" in source
