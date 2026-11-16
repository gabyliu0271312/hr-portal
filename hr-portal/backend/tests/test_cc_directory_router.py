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


def _all_codes(nodes) -> set[str]:
    """递归收集树中所有节点 code（含子节点）。"""
    codes: set[str] = set()
    for node in nodes:
        codes.add(node.code)
        codes |= _all_codes(node.children)
    return codes


class FakeResult:
    def __init__(self, rows=None):
        self.rows = list(rows or [])

    def all(self):
        return list(self.rows)

    def scalars(self):
        return self

    def first(self):
        return self.rows[0] if self.rows else None

    def scalar_one_or_none(self):
        return self.rows[0] if len(self.rows) == 1 else (self.rows[0] if self.rows else None)


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
    codes = {node.code for node in out.tree}
    assert codes == {"C1", "C2"}
    c1 = next(node for node in out.tree if node.code == "C1")
    assert [child.code for child in c1.children] == ["C1-1"]
    assert all(node.is_active for node in out.tree)
    assert out.warnings == []


@pytest.mark.asyncio
async def test_cc_directory_default_excludes_inactive():
    db = FakeSession(_healthy_rows())
    out = await trees_router.get_cc_directory(
        include_inactive=False, _=ACTOR, db=db,
    )
    text = repr(out.tree)
    assert "A1x" not in text


@pytest.mark.asyncio
async def test_cc_directory_include_inactive():
    db = FakeSession(_healthy_rows())
    out = await trees_router.get_cc_directory(
        include_inactive=True, _=ACTOR, db=db,
    )
    text = repr(out.tree)
    assert "A1x" in text


@pytest.mark.asyncio
async def test_cc_directory_exposes_synced_at():
    db = FakeSession(_healthy_rows())
    out = await trees_router.get_cc_directory(
        include_inactive=True, _=ACTOR, db=db,
    )
    assert out.tree[0].synced_at is not None
    assert out.tree[0].synced_at.endswith("+00:00") or out.tree[0].synced_at.endswith("Z")


@pytest.mark.asyncio
async def test_cc_directory_degrades_normative_issues_to_warnings():
    """规范性问题（启用挂停用下、同名路径）不阻断展示：树返回 + warnings 透出。"""
    rows = [
        _cc_node(1, "C1", "一级成本中心A", None, 1, True, path="/一级成本中心A/"),
        _cc_node(2, "C1-1", "二级成本中心A1", 1, 2, True, path="/一级成本中心A/二级成本中心A1/"),
        _cc_node(3, "C1-1y", "二级成本中心A2", 1, 2, False, path="/一级成本中心A/二级成本中心A1/"),
    ]
    db = FakeSession(rows)
    out = await trees_router.get_cc_directory(
        include_inactive=False, _=ACTOR, db=db,
    )
    codes = {issue.code for issue in out.warnings}
    assert "duplicate_path" in codes  # 同名路径 → 降级为 warning
    assert _all_codes(out.tree) == {"C1", "C1-1"}


@pytest.mark.asyncio
async def test_cc_directory_degrades_active_under_inactive_to_warning():
    """父停用子启用（本地维护状态与源层级冲突）→ 降级为 warning 不阻断。"""
    rows = [
        _cc_node(1, "C1", "一级成本中心A", None, 1, False, path="/一级成本中心A/"),
        _cc_node(2, "C1-1", "二级成本中心A1", 1, 2, True, path="/一级成本中心A/二级成本中心A1/"),
    ]
    db = FakeSession(rows)
    out = await trees_router.get_cc_directory(
        include_inactive=True, _=ACTOR, db=db,
    )
    codes = {issue.code for issue in out.warnings}
    assert "active_under_inactive" in codes
    assert _all_codes(out.tree) == {"C1", "C1-1"}


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


@pytest.mark.asyncio
async def test_cc_directory_fails_closed_on_duplicate_code():
    """编码重复是权限锚点歧义，即使展示入口也必须阻断。"""
    rows = [
        _cc_node(1, "C1", "一级成本中心A", None, 1, True, path="/一级成本中心A/"),
        _cc_node(2, "C1", "一级成本中心B", None, 1, True, path="/一级成本中心B/"),
    ]
    db = FakeSession(rows)
    with pytest.raises(HTTPException) as exc_info:
        await trees_router.get_cc_directory(
            include_inactive=False, _=ACTOR, db=db,
        )
    assert exc_info.value.status_code == 409
    detail = exc_info.value.detail
    assert any(issue["code"] == "duplicate_code" for issue in detail["issues"])


def test_cc_directory_declares_people_cost_center_view_permission():
    """回归：目录端点必须通过 require_op('people.cost_center', 'V') 声明菜单查看权限。"""
    import inspect

    source = inspect.getsource(trees_router.get_cc_directory)
    assert "require_op(\"people.cost_center\", \"V\")" in source
    assert "analyze_tree" in source


class WriteSession(FakeSession):
    def __init__(self, rows, integrity_error=None):
        super().__init__(rows)
        self.added = []
        self.committed = False
        self.rolled_back = False
        self.integrity_error = integrity_error

    def add(self, node):
        self.added.append(node)

    def delete(self, node):
        self.rows = [row for row in self.rows if row.id != node.id]

    async def flush(self):
        if self.integrity_error:
            raise self.integrity_error
        for node in self.added:
            node.id = max([row.id for row in self.rows] + [0]) + 1

    async def commit(self):
        self.committed = True

    async def rollback(self):
        self.rolled_back = True


@pytest.mark.asyncio
async def test_empty_directory_allows_first_root_creation():
    out = await trees_router.get_cc_directory(include_inactive=True, _=ACTOR, db=FakeSession([]))
    assert out.model_dump() == {"tree": [], "warnings": []}
    db = WriteSession([])
    out = await trees_router.create_cc_directory(
        trees_router.CostCenterCreate(name=" 根中心 ", code=" CC01 "), _=ACTOR, db=db,
    )
    assert (out.code, out.name, out.parent_id, out.level, out.is_leaf) == ("CC01", "根中心", None, 1, True)
    assert db.added[0].source_mode == "local"
    assert db.added[0].path == "/根中心/"
    assert db.committed and not db.rolled_back
    assert "pg_advisory_xact_lock" in str(db.executed[0][0])


@pytest.mark.asyncio
async def test_create_child_uses_real_parent_chain_and_updates_leaf():
    parent = _cc_node(1, "P", "父", None, 99, True, path="错误缓存")
    db = WriteSession([parent])
    out = await trees_router.create_cc_directory(
        trees_router.CostCenterCreate(name="子", code="C", parent_id=1), _=ACTOR, db=db,
    )
    assert out.level == 2 and out.parent_id == 1
    assert db.added[0].path == "/父/子/"
    assert parent.level == 1 and parent.path == "/父/" and not parent.is_leaf


@pytest.mark.asyncio
@pytest.mark.parametrize("rows,parent_id,code,status", [
    ([_cc_node(1, "DUP", "停用", None, 1, False)], None, "DUP", 409),
    ([], 99, "NEW", 422),
    ([_cc_node(1, "P", "父", None, 1, False)], 1, "NEW", 409),
    ([_cc_node(1, "P", "父", 99, 2, True)], None, "NEW", 409),
    ([_cc_node(1, "P", "父", 2, 1, True), _cc_node(2, "Q", "祖", 1, 2, True)], None, "NEW", 409),
    ([_cc_node(1, "P", "祖", None, 1, False), _cc_node(2, "Q", "父", 1, 2, True)], 2, "NEW", 409),
])
async def test_create_rejects_duplicate_or_invalid_parent(rows, parent_id, code, status):
    db = WriteSession(rows)
    with pytest.raises(HTTPException) as exc:
        await trees_router.create_cc_directory(
            trees_router.CostCenterCreate(name="新", code=code, parent_id=parent_id), _=ACTOR, db=db,
        )
    assert exc.value.status_code == status
    assert not db.added and db.rolled_back and not db.committed


@pytest.mark.parametrize("payload", [
    {"name": "  ", "code": "C"}, {"name": "N", "code": "  "},
    {"name": "N" * 256, "code": "C"}, {"name": "N", "code": "C" * 65},
    {"name": "N", "code": "C", "parent_id": 0},
])
def test_create_validates_required_lengths_and_parent_id(payload):
    from pydantic import ValidationError

    with pytest.raises(ValidationError):
        trees_router.CostCenterCreate(**payload)


@pytest.mark.asyncio
@pytest.mark.parametrize("depth,name_length", [(50, 1), (4, 254)])
async def test_create_rejects_path_and_existing_depth_guard(depth, name_length):
    rows = [_cc_node(i, str(i), "N" * name_length, i - 1 if i > 1 else None, i, True)
            for i in range(1, depth + 1)]
    db = WriteSession(rows)
    with pytest.raises(HTTPException) as exc:
        await trees_router.create_cc_directory(
            trees_router.CostCenterCreate(name="NEW", code="NEW", parent_id=depth), _=ACTOR, db=db,
        )
    assert exc.value.status_code == 422
    assert not db.added and db.rolled_back


@pytest.mark.asyncio
async def test_database_unique_conflict_rolls_back_as_409():
    from sqlalchemy.exc import IntegrityError

    db = WriteSession([], IntegrityError("INSERT", {}, Exception('duplicate key violates "uq_cc_tree_code"')))
    with pytest.raises(HTTPException) as exc:
        await trees_router.create_cc_directory(
            trees_router.CostCenterCreate(name="新", code="DUP"), _=ACTOR, db=db,
        )
    assert exc.value.status_code == 409
    assert db.rolled_back and not db.committed


@pytest.mark.asyncio
@pytest.mark.parametrize("denied_op", ["V", "C"])
async def test_create_http_rejects_missing_view_or_create_permission(denied_op):
    from fastapi import FastAPI
    from httpx import ASGITransport, AsyncClient
    from app.core.db import get_session
    from app.core.deps import current_user

    app = FastAPI()
    app.include_router(trees_router.router)
    db = FakeSession([])
    app.dependency_overrides[current_user] = lambda: ACTOR
    app.dependency_overrides[get_session] = lambda: db
    route = next(route for route in app.routes if getattr(route, "path", None) == "/trees/cost-center/directory"
                 and "POST" in route.methods)
    for dependency in route.dependant.dependencies:
        if not dependency.call.__closure__:
            continue
        closure = dict(zip(dependency.call.__code__.co_freevars,
                           [cell.cell_contents for cell in dependency.call.__closure__]))
        if closure["op"] != denied_op:
            app.dependency_overrides[dependency.call] = lambda: ACTOR
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post("/trees/cost-center/directory", json={"name": "N", "code": "C"})
    assert response.status_code == 403
    assert not any("pg_advisory" in str(statement) for statement, _ in db.executed)


# ===== 更新 / 删除 =====


class UpdateWriteSession(FakeSession):
    def __init__(self, rows):
        super().__init__(rows)
        self.committed = False
        self.rolled_back = False

    async def flush(self):
        pass

    async def commit(self):
        self.committed = True

    async def rollback(self):
        self.rolled_back = True

    def delete(self, node):
        self.rows = [row for row in self.rows if row.id != node.id]


def _child(rows, parent_id, code, name):
    return _cc_node(max(row.id for row in rows) + 1, code, name, parent_id, parent_id + 1, True, path=f"/{name}/")


@pytest.mark.asyncio
async def test_update_cc_renames_and_reparents():
    root = _cc_node(1, "R", "根", None, 1, True, path="/根/")
    child = _cc_node(2, "C", "子", 1, 2, True, path="/根/子/")
    db = UpdateWriteSession([root, child])
    out = await trees_router.update_cc_directory(
        2, trees_router.CostCenterUpdate(name="改名", parent_id=None), _=ACTOR, db=db,
    )
    assert (out.name, out.parent_id, out.level, out.code) == ("改名", None, 1, "C")
    assert db.committed and not db.rolled_back


@pytest.mark.asyncio
async def test_update_cc_rejects_missing_node():
    db = UpdateWriteSession([_cc_node(1, "R", "根", None, 1, True, path="/根/")])
    with pytest.raises(HTTPException) as exc:
        await trees_router.update_cc_directory(
            99, trees_router.CostCenterUpdate(name="新"), _=ACTOR, db=db,
        )
    assert exc.value.status_code == 404
    assert not db.committed and db.rolled_back


@pytest.mark.asyncio
async def test_update_cc_rejects_self_parent():
    db = UpdateWriteSession([_cc_node(1, "R", "根", None, 1, True, path="/根/")])
    with pytest.raises(HTTPException) as exc:
        await trees_router.update_cc_directory(
            1, trees_router.CostCenterUpdate(name="新", parent_id=1), _=ACTOR, db=db,
        )
    assert exc.value.status_code == 422


@pytest.mark.asyncio
async def test_update_cc_rejects_descendant_parent():
    root = _cc_node(1, "R", "根", None, 1, True, path="/根/")
    child = _cc_node(2, "C", "子", 1, 2, True, path="/根/子/")
    db = UpdateWriteSession([root, child])
    with pytest.raises(HTTPException) as exc:
        await trees_router.update_cc_directory(
            1, trees_router.CostCenterUpdate(name="根改名", parent_id=2), _=ACTOR, db=db,
        )
    assert exc.value.status_code == 422


@pytest.mark.asyncio
async def test_update_cc_rejects_missing_parent():
    db = UpdateWriteSession([_cc_node(1, "R", "根", None, 1, True, path="/根/")])
    with pytest.raises(HTTPException) as exc:
        await trees_router.update_cc_directory(
            1, trees_router.CostCenterUpdate(name="新", parent_id=99), _=ACTOR, db=db,
        )
    assert exc.value.status_code == 422


@pytest.mark.asyncio
async def test_update_cc_rejects_inactive_ancestor():
    active = _cc_node(1, "R", "根", None, 1, True, path="/根/")
    inactive = _cc_node(2, "X", "停用父", 1, 2, False, path="/根/停用父/")
    child = _cc_node(3, "C", "子", 1, 2, True, path="/根/子/")
    db = UpdateWriteSession([active, inactive, child])
    with pytest.raises(HTTPException) as exc:
        await trees_router.update_cc_directory(
            3, trees_router.CostCenterUpdate(name="子", parent_id=2), _=ACTOR, db=db,
        )
    assert exc.value.status_code == 409


@pytest.mark.asyncio
async def test_update_cc_rejects_duplicate_path():
    a = _cc_node(1, "A", "同名", None, 1, True, path="/同名/")
    b = _cc_node(2, "B", "同名", None, 1, True, path="/同名/")
    db = UpdateWriteSession([a, b])
    with pytest.raises(HTTPException) as exc:
        await trees_router.update_cc_directory(
            1, trees_router.CostCenterUpdate(name="同名"), _=ACTOR, db=db,
        )
    assert exc.value.status_code == 409


@pytest.mark.asyncio
async def test_delete_cc_leaf_succeeds():
    root = _cc_node(1, "R", "根", None, 1, True, path="/根/")
    child = _cc_node(2, "C", "子", 1, 2, True, path="/根/子/")
    db = UpdateWriteSession([root, child])
    out = await trees_router.delete_cc_directory(2, _=ACTOR, db=db)
    assert out is None
    assert db.committed and not db.rolled_back
    # 重算后根重新成为叶子
    assert root.is_leaf


@pytest.mark.asyncio
async def test_delete_cc_rejects_when_has_children():
    root = _cc_node(1, "R", "根", None, 1, True, path="/根/")
    child = _cc_node(2, "C", "子", 1, 2, True, path="/根/子/")
    db = UpdateWriteSession([root, child])
    with pytest.raises(HTTPException) as exc:
        await trees_router.delete_cc_directory(1, _=ACTOR, db=db)
    assert exc.value.status_code == 409
    assert exc.value.detail == "该成本中心包含下级成本中心，不允许删除"
    assert not db.committed and db.rolled_back


@pytest.mark.asyncio
async def test_delete_cc_rejects_missing_node():
    db = UpdateWriteSession([_cc_node(1, "R", "根", None, 1, True, path="/根/")])
    with pytest.raises(HTTPException) as exc:
        await trees_router.delete_cc_directory(99, _=ACTOR, db=db)
    assert exc.value.status_code == 404


def test_update_and_delete_declare_people_cost_center_ops():
    """回归：编辑/删除端点必须通过 require_op 声明 U/D 操作权限。"""
    import inspect

    update_source = inspect.getsource(trees_router.update_cc_directory)
    delete_source = inspect.getsource(trees_router.delete_cc_directory)
    assert 'require_op("people.cost_center", "U")' in update_source
    assert 'require_op("people.cost_center", "D")' in delete_source
